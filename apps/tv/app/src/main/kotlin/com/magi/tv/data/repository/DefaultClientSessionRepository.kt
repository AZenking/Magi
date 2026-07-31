package com.magi.tv.data.repository

import android.os.Build
import com.magi.tv.BuildConfig
import com.magi.tv.data.auth.TokenException
import com.magi.tv.data.auth.TokenManager
import com.magi.tv.data.remote.ClientApi
import com.magi.tv.data.remote.ClientApiEnvelope
import com.magi.tv.data.remote.DeviceAuthorizationRequestDto
import com.magi.tv.data.remote.DeviceRegistrationRequestDto
import com.magi.tv.data.remote.HeartbeatRequestDto
import com.magi.tv.domain.model.DeviceAuthorizationChallenge
import com.magi.tv.domain.model.ContentRevision
import com.magi.tv.domain.model.HeartbeatObservation
import com.magi.tv.domain.repository.ClientSessionRepository
import com.magi.tv.domain.repository.ClientCredentialStore
import com.magi.tv.domain.repository.PollResult
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.coroutines.CancellationException
import java.time.Instant

/** Production implementation of automatic device registration and liveness. */
class DefaultClientSessionRepository(
    private val tokenManager: TokenManager,
    private val api: ClientApi,
    private val credentialStore: ClientCredentialStore,
) : ClientSessionRepository {

    override suspend fun registerDefaultDevice(): String {
        return try {
            val response = api.registerDevice(
                registrationRequest(credentialStore.getOrCreateInstallationId()),
            ).requireData()
            tokenManager.saveDeviceToken(response)
            response.deviceClientId
                ?: throw ClientSessionException("invalid_response", "服务返回了无效设备信息")
        } catch (error: CancellationException) {
            throw error
        } catch (error: ClientSessionException) {
            throw error
        } catch (error: HttpException) {
            val message = when (error.code()) {
                401 -> "设备已被吊销或客户端配置无效，请联系管理员"
                503 -> "默认账户暂不可用，请稍后重试"
                else -> "设备自动注册失败"
            }
            throw ClientSessionException("registration_failed", message)
        } catch (error: Exception) {
            throw ClientSessionException("registration_failed", error.message ?: "设备自动注册失败")
        }
    }

    override suspend fun beginAuthorization(): DeviceAuthorizationChallenge {
        val response = api.beginAuthorization(
            deviceRequest(),
        ).requireData()
        return DeviceAuthorizationChallenge(
            deviceCode = response.deviceCode,
            userCode = response.userCode,
            verificationUri = response.verificationUri,
            expiresAt = Instant.now().plusSeconds(response.expiresIn.toLong()),
            intervalSeconds = response.interval,
        )
    }

    override suspend fun pollAuthorization(challenge: DeviceAuthorizationChallenge): PollResult {
        return try {
            val token = tokenManager.exchangeDeviceCode(challenge.deviceCode)
            tokenManager.saveDeviceToken(token)
            PollResult.Authorized(token.deviceClientId.orEmpty())
        } catch (error: TokenException) {
            when (error.code) {
                "authorization_pending" -> PollResult.Pending
                "slow_down" -> PollResult.SlowDown(challenge.intervalSeconds + 5)
                "access_denied" -> PollResult.Denied
                "expired_token" -> PollResult.Expired
                else -> PollResult.TemporaryFailure(error.message ?: "授权失败")
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            PollResult.TemporaryFailure(error.message ?: "网络连接失败")
        }
    }

    override suspend fun heartbeat(): HeartbeatObservation {
        val token = tokenManager.getValidToken()
        return try {
            val result = api.heartbeat(
                authorization = "Bearer $token",
                request = HeartbeatRequestDto(
                    appVersion = BuildConfig.VERSION_NAME.take(64),
                    platformVersion = "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})".take(64),
                ),
            ).requireData()
            HeartbeatObservation(
                serverTime = Instant.parse(result.serverTime),
                lastActiveAt = Instant.parse(result.lastActiveAt),
                nextHeartbeatInSeconds = result.nextHeartbeatInSeconds,
                onlineWindowSeconds = result.onlineWindowSeconds,
                contentRevision = result.contentRevision?.let {
                    ContentRevision(catalog = it.catalog, epg = it.epg)
                },
            )
        } catch (error: HttpException) {
            // A device-bound heartbeat must never keep retrying a token that
            // the server no longer accepts. The guard intentionally collapses
            // revoked/expired device credentials to 401, so clear the local
            // credential and let the top-level TV gate retry registration.
            if (error.code() == 401 || error.code() == 403) {
                tokenManager.clearCredentials()
            }
            throw ClientSessionException("heartbeat_failed", "设备心跳失败")
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            if (error is ClientSessionException) throw error
            throw ClientSessionException("heartbeat_failed", error.message ?: "设备心跳失败")
        }
    }

    override suspend fun clearCredentials() = tokenManager.clearCredentials()

    private fun deviceRequest() =
        DeviceAuthorizationRequestDto(
            clientId = BuildConfig.MAGI_DEVICE_CLIENT_ID,
            platformVersion = "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})".take(64),
            appVersion = BuildConfig.VERSION_NAME.take(64),
            identitySummary = "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(120),
            suggestedName = Build.MODEL.trim().takeIf { it.isNotEmpty() }?.take(64),
        )

    private fun registrationRequest(installationId: String) =
        DeviceRegistrationRequestDto(
            clientId = BuildConfig.MAGI_DEVICE_CLIENT_ID,
            platformVersion = "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})".take(64),
            appVersion = BuildConfig.VERSION_NAME.take(64),
            identitySummary = "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(120),
            suggestedName = Build.MODEL.trim().takeIf { it.isNotEmpty() }?.take(64),
            installationId = installationId,
        )

    companion object {
        fun createApi(): ClientApi {
            val json = Json {
                ignoreUnknownKeys = true
                coerceInputValues = true
                // The public registration contract requires the default
                // device_type/platform fields to be sent, not omitted as
                // kotlinx.serialization normally does for default values.
                encodeDefaults = true
                explicitNulls = false
            }
            val client = OkHttpClient.Builder().build()
            return Retrofit.Builder()
                .baseUrl("${BuildConfig.MAGI_SERVER_URL.trim().trimEnd('/')}/")
                .client(client)
                .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                .build()
                .create(ClientApi::class.java)
        }
    }
}

class ClientSessionException(
    val code: String,
    message: String,
) : Exception(message)

private fun <T> ClientApiEnvelope<T>.requireData(): T {
    if (!success || data == null) throw ClientSessionException("invalid_response", "服务返回了无效响应")
    return data
}
