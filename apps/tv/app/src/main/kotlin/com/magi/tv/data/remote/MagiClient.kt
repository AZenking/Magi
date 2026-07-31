package com.magi.tv.data.remote

import com.magi.tv.BuildConfig
import com.magi.tv.data.auth.TokenException
import com.magi.tv.data.auth.TokenManager
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * Builds the Retrofit [OpenApi] client with OAuth2 token injection.
 *
 * Two OkHttp hooks cooperate:
 *  - [AuthInterceptor] attaches the current Bearer token to every request.
 *  - [TokenAuthenticator] refreshes the token on 401 and retries exactly once.
 *
 * If the token cannot be refreshed (client disabled/revoked), the authenticator
 * returns null (giving up) so the 401 propagates to the caller — the ViewModel
 * surfaces the error via catalogError.
 */
object MagiClient {

    fun create(tokenManager: TokenManager): OpenApi {
        val json = Json {
            ignoreUnknownKeys = true
            coerceInputValues = true
        }

        val authInterceptor = AuthInterceptor(tokenManager)
        val tokenAuthenticator = TokenAuthenticator(tokenManager)

        val client = OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(
                HttpLoggingInterceptor().apply {
                    level = HttpLoggingInterceptor.Level.BASIC
                },
            )
            .authenticator(tokenAuthenticator)
            .build()

        val normalizedBaseUrl = "${BuildConfig.MAGI_SERVER_URL.trim().trimEnd('/')}/"

        return Retrofit.Builder()
            .baseUrl(normalizedBaseUrl)
            .client(client)
            .addConverterFactory(
                json.asConverterFactory("application/json".toMediaType()),
            )
            .build()
            .create(OpenApi::class.java)
    }
}

/**
 * Attaches the current access token as a Bearer header.
 * Uses runBlocking because OkHttp interceptors are synchronous — the token
 * manager's Mutex ensures this is safe and fast (cached tokens return immediately).
 */
private class AuthInterceptor(
    private val tokenManager: TokenManager,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = try {
            runBlocking { tokenManager.getValidToken() }
        } catch (_: TokenException) {
            // Token unavailable (client disabled/revoked). Proceed without a
            // token — the server will return 401, and the caller handles it.
            return chain.proceed(chain.request())
        }
        val request = chain.request().newBuilder()
            .addHeader("Authorization", "Bearer $token")
            .build()
        return chain.proceed(request)
    }
}

/**
 * On 401, refreshes the token and retries the request exactly once.
 * OkHttp guarantees at most one retry per authenticator (response.priorResponse
 * chain). If refresh fails (TokenException), returns null so the 401 reaches
 * the caller.
 */
private class TokenAuthenticator(
    private val tokenManager: TokenManager,
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        // Stop retrying if we already retried (prevents infinite loops).
        if (response.responseCount() >= 2) return null

        val newToken = try {
            runBlocking { tokenManager.refreshToken() }
        } catch (_: TokenException) {
            // Client disabled/revoked or network failure — can't recover.
            return null
        }

        return response.request.newBuilder()
            .header("Authorization", "Bearer $newToken")
            .build()
    }
}

/** Count how many times this response has been retried (follows priorResponse chain). */
private fun Response.responseCount(): Int {
    var count = 1
    var prior = priorResponse
    while (prior != null) {
        count++
        prior = prior.priorResponse
    }
    return count
}
