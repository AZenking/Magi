package com.magi.tv.data.repository

import com.magi.tv.data.auth.TokenManager
import com.magi.tv.data.auth.TokenResponse
import com.magi.tv.data.remote.ClientApi
import com.magi.tv.data.remote.ClientApiEnvelope
import com.magi.tv.data.remote.DeviceAuthorizationRequestDto
import com.magi.tv.data.remote.DeviceAuthorizationResponseDto
import com.magi.tv.data.remote.DeviceRegistrationRequestDto
import com.magi.tv.data.remote.HeartbeatRequestDto
import com.magi.tv.data.remote.HeartbeatResponseDto
import com.magi.tv.data.remote.PlaybackReportRequestDto
import com.magi.tv.domain.model.DeviceCredentials
import com.magi.tv.domain.repository.ClientCredentialStore
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.HttpException
import retrofit2.Response
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class DefaultClientSessionRepositoryTest {
    private class FakeCredentialStore : ClientCredentialStore {
        override suspend fun getOrCreateInstallationId() = "installation-1"
        override suspend fun read() = null
        override suspend fun write(credentials: DeviceCredentials) = Unit
        override suspend fun clear() = Unit
    }

    private class FakeClientApi(
        private val heartbeatBlock: suspend (String) -> ClientApiEnvelope<HeartbeatResponseDto>,
    ) : ClientApi {
        val heartbeatAuthorizations = mutableListOf<String>()

        override suspend fun registerDevice(request: DeviceRegistrationRequestDto): ClientApiEnvelope<TokenResponse> =
            error("unused")

        override suspend fun beginAuthorization(
            request: DeviceAuthorizationRequestDto,
        ): ClientApiEnvelope<DeviceAuthorizationResponseDto> = error("unused")

        override suspend fun heartbeat(
            authorization: String,
            request: HeartbeatRequestDto,
        ): ClientApiEnvelope<HeartbeatResponseDto> {
            heartbeatAuthorizations += authorization
            return heartbeatBlock(authorization)
        }

        override suspend fun reportPlayback(
            authorization: String,
            request: PlaybackReportRequestDto,
        ): ClientApiEnvelope<Unit> = error("unused")
    }

    private fun aTokenManager(store: ClientCredentialStore) = TokenManager(store)

    private fun heartbeatResponse() = ClientApiEnvelope(
        success = true,
        data = HeartbeatResponseDto(
            serverTime = "2026-08-08T00:00:00Z",
            lastActiveAt = "2026-08-08T00:00:00Z",
            nextHeartbeatInSeconds = 60,
            onlineWindowSeconds = 150,
        ),
    )

    private fun unauthorized(): HttpException = HttpException(
        Response.error<ClientApiEnvelope<HeartbeatResponseDto>>(
            401,
            "{\"code\":\"access-token-invalid\"}"
                .toResponseBody("application/json".toMediaType()),
        ),
    )

    @Test
    fun `heartbeat DTO keeps server timestamps and cadence fields`() {
        val dto = HeartbeatResponseDto(
            serverTime = "2026-07-31T00:00:00Z",
            lastActiveAt = "2026-07-31T00:00:00Z",
            nextHeartbeatInSeconds = 60,
            onlineWindowSeconds = 150,
        )
        assertEquals(60, dto.nextHeartbeatInSeconds)
        assertEquals(150, dto.onlineWindowSeconds)
    }

    @Test
    fun `heartbeat refreshes a rejected access token and retries once`() = runTest {
        val store = FakeCredentialStore()
        val api = FakeClientApi { authorization ->
            if (authorization == "Bearer stale-token") throw unauthorized()
            heartbeatResponse()
        }
        var refreshedPreviousToken: String? = null
        val repository = DefaultClientSessionRepository(
            tokenManager = aTokenManager(store),
            api = api,
            credentialStore = store,
            getValidToken = { "stale-token" },
            refreshTokenAfterUnauthorized = { previous ->
                refreshedPreviousToken = previous
                "fresh-token"
            },
        )

        val observation = repository.heartbeat()

        assertEquals("stale-token", refreshedPreviousToken)
        assertEquals(listOf("Bearer stale-token", "Bearer fresh-token"), api.heartbeatAuthorizations)
        assertEquals(60, observation.nextHeartbeatInSeconds)
    }

    @Test
    fun `heartbeat clears credentials after a forced refresh is also rejected`() = runTest {
        val store = FakeCredentialStore()
        val api = FakeClientApi { throw unauthorized() }
        var cleared = false
        val repository = DefaultClientSessionRepository(
            tokenManager = aTokenManager(store),
            api = api,
            credentialStore = store,
            getValidToken = { "stale-token" },
            refreshTokenAfterUnauthorized = { "fresh-token" },
            clearLocalCredentials = { cleared = true },
        )

        val error = assertFailsWith<ClientSessionException> { repository.heartbeat() }

        assertEquals("requires_registration", error.code)
        assertTrue(cleared)
        assertEquals(listOf("Bearer stale-token", "Bearer fresh-token"), api.heartbeatAuthorizations)
    }
}
