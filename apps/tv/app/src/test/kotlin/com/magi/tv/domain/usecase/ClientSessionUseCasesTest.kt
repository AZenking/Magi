package com.magi.tv.domain.usecase

import com.magi.tv.domain.model.DeviceAuthorizationChallenge
import com.magi.tv.domain.model.HeartbeatObservation
import com.magi.tv.domain.repository.ClientSessionRepository
import com.magi.tv.domain.repository.PollResult
import kotlinx.coroutines.test.runTest
import org.junit.Test
import java.time.Instant
import kotlin.test.assertEquals

class ClientSessionUseCasesTest {
    @Test
    fun `authorization use cases keep terminal poll results explicit`() = runTest {
        val challenge = DeviceAuthorizationChallenge(
            deviceCode = "device-code",
            userCode = "ABCD-2345",
            verificationUri = "https://magi.example/authorize",
            expiresAt = Instant.now().plusSeconds(600),
            intervalSeconds = 5,
        )
        val repository = object : ClientSessionRepository {
            override suspend fun registerDefaultDevice() = "device-1"
            override suspend fun beginAuthorization() = challenge
            override suspend fun pollAuthorization(challenge: DeviceAuthorizationChallenge) = PollResult.Denied
            override suspend fun heartbeat() = HeartbeatObservation(Instant.EPOCH, Instant.EPOCH, 60, 150)
            override suspend fun clearCredentials() = Unit
            override suspend fun reportPlayback(report: com.magi.tv.domain.repository.PlaybackReport) = Unit
        }

        assertEquals(challenge, BeginClientAuthorizationUseCase(repository)())
        assertEquals(PollResult.Denied, PollClientAuthorizationUseCase(repository)(challenge))
    }
}
