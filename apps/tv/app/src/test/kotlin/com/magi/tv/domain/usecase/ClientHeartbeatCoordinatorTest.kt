package com.magi.tv.domain.usecase

import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.magi.tv.domain.model.DeviceCredentials
import com.magi.tv.domain.model.HeartbeatObservation
import com.magi.tv.domain.repository.ClientCredentialStore
import com.magi.tv.domain.repository.ClientSessionRepository
import com.magi.tv.domain.repository.ConnectivityMonitor
import com.magi.tv.platform.client.ClientHeartbeatCoordinator
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test
import java.time.Instant
import kotlin.test.assertEquals

class ClientHeartbeatCoordinatorTest {
    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    @Test
    fun `foreground start sends one immediate heartbeat and stop cancels loop`() = runTest {
        var heartbeats = 0
        val owner = TestLifecycleOwner()
        val coordinator = ClientHeartbeatCoordinator(
            repository = object : ClientSessionRepository {
                override suspend fun registerDefaultDevice() = "device-1"
                override suspend fun beginAuthorization() = error("unused")
                override suspend fun pollAuthorization(challenge: com.magi.tv.domain.model.DeviceAuthorizationChallenge) = error("unused")
                override suspend fun heartbeat(): HeartbeatObservation {
                    heartbeats += 1
                    return HeartbeatObservation(Instant.EPOCH, Instant.EPOCH, 60, 150)
                }
                override suspend fun clearCredentials() = Unit
            },
            credentialStore = object : ClientCredentialStore {
                override suspend fun getOrCreateInstallationId() = "installation-1"
                override suspend fun read() = DeviceCredentials("device-1", "refresh", "family", 1)
                override suspend fun write(credentials: DeviceCredentials) = Unit
                override suspend fun clear() = Unit
            },
            connectivity = object : ConnectivityMonitor {
                override fun isOnline() = true
                override fun observe(listener: () -> Unit) = AutoCloseable { }
            },
            scope = this,
        )

        coordinator.onStart(owner)
        runCurrent()
        assertEquals(1, heartbeats)

        coordinator.onStop(owner)
    }

    private class TestLifecycleOwner : LifecycleOwner {
        override val lifecycle = LifecycleRegistry(this)
    }
}
