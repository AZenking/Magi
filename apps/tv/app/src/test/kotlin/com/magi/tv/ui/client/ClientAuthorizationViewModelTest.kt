package com.magi.tv.ui.client

import com.magi.tv.domain.model.HeartbeatObservation
import com.magi.tv.domain.model.DeviceAuthorizationChallenge
import com.magi.tv.domain.repository.ClientSessionRepository
import com.magi.tv.domain.repository.PollResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.Instant
import kotlin.test.assertEquals

@OptIn(ExperimentalCoroutinesApi::class)
class ClientAuthorizationViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    /** A repository fake whose registerDefaultDevice behaviour is configurable per test. */
    private class FakeRepository(
        private val register: suspend () -> String,
    ) : ClientSessionRepository {
        override suspend fun registerDefaultDevice() = register()
        override suspend fun beginAuthorization() = DeviceAuthorizationChallenge(
            deviceCode = "dc", userCode = "ABCD-2345",
            verificationUri = "https://magi.example/authorize",
            expiresAt = Instant.now().plusSeconds(600), intervalSeconds = 5,
        )
        override suspend fun pollAuthorization(challenge: DeviceAuthorizationChallenge) = PollResult.Authorized("device-1")
        override suspend fun heartbeat() = HeartbeatObservation(Instant.EPOCH, Instant.EPOCH, 60, 150)
        override suspend fun clearCredentials() = Unit
            override suspend fun reportPlayback(report: com.magi.tv.domain.repository.PlaybackReport) = Unit
    }

    @Test
    fun `start transitions to Authorized when default registration succeeds`() = runTest(dispatcher) {
        val repo = FakeRepository { "device-1" }
        val vm = ClientAuthorizationViewModel(repo)

        vm.start()
        advanceUntilIdle()

        assertEquals(ClientAuthorizationPhase.Authorized, vm.uiState.value.phase)
        assertEquals("设备已自动注册", vm.uiState.value.message)
    }

    @Test
    fun `start transitions to Failed when default registration throws`() = runTest(dispatcher) {
        val repo = FakeRepository { error("boom") }
        val vm = ClientAuthorizationViewModel(repo)

        vm.start()
        advanceUntilIdle()

        assertEquals(ClientAuthorizationPhase.Failed, vm.uiState.value.phase)
        assertEquals("boom", vm.uiState.value.message)
    }

    @Test
    fun `start uses a generic message when the exception has no message`() = runTest(dispatcher) {
        val repo = FakeRepository { throw RuntimeException() }
        val vm = ClientAuthorizationViewModel(repo)

        vm.start()
        advanceUntilIdle()

        assertEquals(ClientAuthorizationPhase.Failed, vm.uiState.value.phase)
        assertEquals("设备自动注册失败", vm.uiState.value.message)
    }

    @Test
    fun `start is idempotent while a registration is already in flight`() = runTest(dispatcher) {
        var callCount = 0
        val repo = FakeRepository {
            callCount++
            "device-1"
        }
        val vm = ClientAuthorizationViewModel(repo)

        vm.start()
        // Calling again before the coroutine runs must not start a second job.
        vm.start()
        advanceUntilIdle()

        assertEquals(1, callCount)
    }

    @Test
    fun `retry resets to Loading and re-attempts registration`() = runTest(dispatcher) {
        var firstAttempt = true
        var callCount = 0
        val repo = FakeRepository {
            callCount++
            if (firstAttempt) {
                firstAttempt = false
                error("transient")
            }
            "device-1"
        }
        val vm = ClientAuthorizationViewModel(repo)

        vm.start()
        advanceUntilIdle()
        assertEquals(ClientAuthorizationPhase.Failed, vm.uiState.value.phase)

        vm.retry()
        // Immediately after retry the phase resets to Loading.
        assertEquals(ClientAuthorizationPhase.Loading, vm.uiState.value.phase)
        advanceUntilIdle()

        assertEquals(ClientAuthorizationPhase.Authorized, vm.uiState.value.phase)
        assertEquals(2, callCount)
    }

    @Test
    fun `initial state is Loading`() {
        val repo = FakeRepository { "device-1" }
        val vm = ClientAuthorizationViewModel(repo)

        assertEquals(ClientAuthorizationPhase.Loading, vm.uiState.value.phase)
    }
}
