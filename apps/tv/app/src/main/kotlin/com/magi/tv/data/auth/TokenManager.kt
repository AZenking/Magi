package com.magi.tv.data.auth

import com.magi.tv.BuildConfig
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * Sealed result of a token issuance attempt. The TV UI uses these to show the
 * right message — e.g. "设备已被禁用" vs generic network error.
 */
sealed interface TokenResult {
    data class Success(val accessToken: String) : TokenResult
    /** Client not found or secret mismatch. */
    data object InvalidClient : TokenResult
    /** Client is disabled — tokens can't be issued but old ones still work. */
    data object ClientDisabled : TokenResult
    /** Client is revoked — all tokens are invalidated. */
    data object ClientRevoked : TokenResult
    /** Network error, server down, etc. */
    data class Error(val message: String) : TokenResult
}

/**
 * Manages the OAuth2 access token lifecycle for the TV client.
 *
 * Configuration (serverUrl, clientId, clientSecret) is baked in at compile time
 * via BuildConfig — the user never enters anything (004-safe-operations).
 *
 * - [getValidToken] returns a cached token if still valid, otherwise refreshes.
 * - [refreshToken] forces a new token (used by the OkHttp Authenticator on 401).
 * - Token refresh is serialised via a Mutex to avoid stampede on 401 storms.
 */
class TokenManager(
    context: android.content.Context,
) {
    private val store = TokenStore(context.applicationContext)
    private val refreshMutex = Mutex()

    private val tokenApi: TokenApi = run {
        val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }
        val client = OkHttpClient.Builder().build()
        val baseUrl = "${BuildConfig.MAGI_SERVER_URL.trim().trimEnd('/')}/"
        Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(TokenApi::class.java)
    }

    /**
     * Returns a valid access token. If the cached token hasn't expired (with a
     * 60s safety margin), returns it directly. Otherwise refreshes.
     * Throws if the client is disabled/revoked or the network fails.
     */
    suspend fun getValidToken(): String {
        val cached = store.getAccessToken()
        val expiresAt = store.getExpiresAt()
        val now = System.currentTimeMillis()
        // 60s safety margin so the token doesn't expire mid-request.
        if (cached != null && expiresAt - now > 60_000) {
            return cached
        }
        return refreshTokenBlocking()
    }

    /**
     * Forces a token refresh. Called by the OkHttp Authenticator on 401.
     * Returns the new token or throws on failure.
     */
    suspend fun refreshToken(): String = refreshTokenBlocking()

    private suspend fun refreshTokenBlocking(): String = refreshMutex.withLock {
        // Double-check after acquiring the lock — another coroutine may have
        // already refreshed while we were waiting.
        val cached = store.getAccessToken()
        val expiresAt = store.getExpiresAt()
        val now = System.currentTimeMillis()
        if (cached != null && expiresAt - now > 60_000) {
            return@withLock cached
        }

        val result = issueToken()
        when (result) {
            is TokenResult.Success -> {
                store.save(result.accessToken, now + TOKEN_TTL_MS)
                result.accessToken
            }
            is TokenResult.InvalidClient ->
                throw TokenException("客户端凭证无效，请联系管理员")
            is TokenResult.ClientDisabled ->
                throw TokenException("设备已被禁用，请联系管理员")
            is TokenResult.ClientRevoked ->
                throw TokenException("设备已被吊销，请联系管理员")
            is TokenResult.Error ->
                throw TokenException(result.message)
        }
    }

    /** Issues a new token via the Client Credentials Grant. */
    private suspend fun issueToken(): TokenResult {
        return try {
            val envelope = tokenApi.token(
                TokenRequest(
                    clientId = BuildConfig.OAUTH_CLIENT_ID,
                    clientSecret = BuildConfig.OAUTH_CLIENT_SECRET,
                ),
            )
            val data = envelope.data
            if (!envelope.success || data == null) {
                TokenResult.Error("服务返回了无效响应")
            } else {
                TokenResult.Success(data.accessToken)
            }
        } catch (e: retrofit2.HttpException) {
            // The backend returns 401 with a problem+json code field.
            val code = extractErrorCode(e)
            when (code) {
                "invalid-client" -> TokenResult.InvalidClient
                "client-disabled" -> TokenResult.ClientDisabled
                "client-revoked" -> TokenResult.ClientRevoked
                else -> TokenResult.Error("认证失败：${e.code()}")
            }
        } catch (e: Exception) {
            TokenResult.Error(e.message ?: "网络连接失败")
        }
    }

    /** Best-effort extraction of the `code` field from a problem+json error body. */
    private fun extractErrorCode(e: retrofit2.HttpException): String? {
        return try {
            val raw = e.response()?.errorBody()?.string() ?: return null
            val json = Json { ignoreUnknownKeys = true }
            val parsed = json.parseToJsonElement(raw).jsonObject
            parsed["code"]?.jsonPrimitive?.contentOrNull
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        // Match ACCESS_TOKEN_TTL_SECONDS on the backend (3600s = 1h).
        private const val TOKEN_TTL_MS = 3600L * 1000L
    }
}

/** Thrown when token issuance fails (client disabled/revoked, network, etc.). */
class TokenException(message: String) : Exception(message)

// --- kotlinx.serialization helpers for error body parsing ---
private val kotlinx.serialization.json.JsonElement.jsonObject
    get() = this as kotlinx.serialization.json.JsonObject
private val kotlinx.serialization.json.JsonElement.jsonPrimitive
    get() = this as kotlinx.serialization.json.JsonPrimitive
private val kotlinx.serialization.json.JsonPrimitive.contentOrNull: String?
    get() = if (this.isString) this.content else null
