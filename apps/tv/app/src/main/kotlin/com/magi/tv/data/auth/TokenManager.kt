package com.magi.tv.data.auth

import com.magi.tv.BuildConfig
import com.magi.tv.domain.model.DeviceCredentials
import com.magi.tv.domain.repository.ClientCredentialStore
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * Owns the device OAuth lifecycle. The only durable credential is the rotating
 * refresh token, encrypted by [ClientCredentialStore]; access tokens remain in
 * memory and are recreated after process death.
 */
class TokenManager(
    private val credentialStore: ClientCredentialStore,
) {
    private val refreshMutex = Mutex()
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        encodeDefaults = true
        explicitNulls = false
    }
    private val tokenApi: TokenApi = createTokenApi()
    private val mutableCredentials = MutableStateFlow<DeviceCredentials?>(null)
    val credentials = mutableCredentials.asStateFlow()

    @Volatile
    private var accessToken: String? = null

    @Volatile
    private var accessTokenExpiresAtMs: Long = 0L

    suspend fun hasCredentials(): Boolean {
        val credentials = credentialStore.read()
        mutableCredentials.value = credentials
        return credentials != null
    }

    suspend fun clearCredentials() {
        accessToken = null
        accessTokenExpiresAtMs = 0L
        credentialStore.clear()
        mutableCredentials.value = null
    }

    suspend fun getValidToken(): String {
        val cached = accessToken
        if (cached != null && accessTokenExpiresAtMs - System.currentTimeMillis() > SAFETY_MARGIN_MS) {
            return cached
        }
        return refreshTokenBlocking(force = false)
    }

    /** Used by OkHttp's authenticator to force a single-flight refresh. */
    suspend fun refreshToken(): String = refreshTokenBlocking(force = true)

    /** Reuses a token another 401 waiter already installed, if it changed. */
    suspend fun refreshTokenAfterUnauthorized(previousToken: String?): String {
        val current = accessToken
        if (
            current != null && current != previousToken &&
            accessTokenExpiresAtMs - System.currentTimeMillis() > SAFETY_MARGIN_MS
        ) {
            return current
        }
        return refreshTokenBlocking(force = true)
    }

    /** Legacy compatibility path for older RFC 8628 clients. */
    suspend fun exchangeDeviceCode(deviceCode: String): TokenResponse {
        return requestToken(
            TokenRequest(
                grantType = DEVICE_CODE_GRANT,
                clientId = BuildConfig.MAGI_DEVICE_CLIENT_ID,
                deviceCode = deviceCode,
            ),
        )
    }

    /** Persists a newly issued device refresh token and caches its access token. */
    suspend fun saveDeviceToken(response: TokenResponse) {
        val refresh = response.refreshToken
            ?: throw TokenException("invalid_response", "认证响应缺少 refresh_token")
        val deviceId = response.deviceClientId
            ?: throw TokenException("invalid_response", "认证响应缺少 device_client_id")
        val previous = credentialStore.read()
        val credentials = DeviceCredentials(
            deviceClientId = deviceId,
            refreshToken = refresh,
            familyId = previous?.familyId ?: deviceId,
            generation = (previous?.generation ?: 0) + 1,
        )
        credentialStore.write(credentials)
        mutableCredentials.value = credentials
        cache(response)
    }

    private suspend fun refreshTokenBlocking(force: Boolean): String = refreshMutex.withLock {
        val now = System.currentTimeMillis()
        val cached = accessToken
        if (!force && cached != null && accessTokenExpiresAtMs - now > SAFETY_MARGIN_MS) {
            return@withLock cached
        }
        val credentials = credentialStore.read()
            ?: throw TokenException("requires_registration", "设备尚未完成自动登记")
        val response = try {
            requestToken(
                TokenRequest(
                    grantType = REFRESH_TOKEN_GRANT,
                    clientId = BuildConfig.MAGI_DEVICE_CLIENT_ID,
                    refreshToken = credentials.refreshToken,
                ),
            )
        } catch (error: TokenException) {
            if (error.code in INVALID_CREDENTIAL_CODES) {
                clearCredentials()
            }
            throw error
        }
        saveDeviceToken(response)
        return@withLock response.accessToken
    }

    private suspend fun requestToken(request: TokenRequest): TokenResponse {
        return try {
            val envelope = tokenApi.token(request)
            if (!envelope.success || envelope.data == null) {
                throw TokenException("invalid_response", "服务返回了无效认证响应")
            }
            envelope.data
        } catch (error: TokenException) {
            throw error
        } catch (error: HttpException) {
            val code = extractErrorCode(error) ?: "http_${error.code()}"
            throw TokenException(code, messageFor(code, error.code()))
        } catch (error: Exception) {
            throw TokenException("network", error.message ?: "网络连接失败")
        }
    }

    private fun cache(response: TokenResponse) {
        accessToken = response.accessToken
        accessTokenExpiresAtMs = System.currentTimeMillis() + response.expiresIn * 1000L
    }

    private fun createTokenApi(): TokenApi {
        val client = OkHttpClient.Builder()
            .addInterceptor(
                HttpLoggingInterceptor().apply {
                    level = HttpLoggingInterceptor.Level.BASIC
                },
            )
            .build()
        val baseUrl = "${BuildConfig.MAGI_SERVER_URL.trim().trimEnd('/')}/"
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(TokenApi::class.java)
    }

    private fun extractErrorCode(error: HttpException): String? {
        return try {
            val raw = error.response()?.errorBody()?.string() ?: return null
            val parsed = json.parseToJsonElement(raw)
            (parsed as? JsonObject)?.get("code")?.let { (it as? JsonPrimitive)?.contentOrNull }
        } catch (_: Exception) {
            null
        }
    }

    private fun messageFor(code: String, status: Int): String = when (code) {
        "invalid_grant", "expired_token" -> "设备凭据已失效，正在重新登记"
        "device-client-revoked", "client-revoked" -> "设备已被吊销，请联系管理员"
        "client-disabled" -> "设备客户端已被暂停，请联系管理员"
        "invalid-client" -> "设备客户端配置无效"
        "client-migration-required" -> "请升级电视应用并完成设备自动登记"
        else -> "认证失败（$status）"
    }

    companion object {
        private const val SAFETY_MARGIN_MS = 60_000L
        const val DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"
        const val REFRESH_TOKEN_GRANT = "refresh_token"
        private val INVALID_CREDENTIAL_CODES = setOf(
            "invalid_grant",
            "expired_token",
            "device-client-revoked",
            "client-revoked",
        )
    }
}

class TokenException(
    val code: String,
    message: String,
) : Exception(message)
