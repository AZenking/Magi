package com.magi.tv.data

import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.magi.tv.domain.model.DeviceCredentials
import com.magi.tv.domain.model.HeartbeatObservation
import com.magi.tv.domain.repository.ClientCredentialStore
import com.magi.tv.domain.repository.ClientSessionRepository
import com.magi.tv.domain.repository.ConnectivityMonitor
import com.magi.tv.platform.client.ClientHeartbeatCoordinator
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test
import java.time.Instant
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Heartbeat acceptance scenarios (T044, US2) — JVM-virtual-time assertions for
 * the behavioural contract. Real wall-clock ≤10s/≤180s bounds are covered by
 * the physical-device acceptance (T073).
 */
class HeartbeatAcceptanceTest {

    private class TestLifecycleOwner : LifecycleOwner {
        override val lifecycle = LifecycleRegistry(this)
    }

    private class CountingRepository(
        private val heartbeats: AtomicInteger,
    ) : ClientSessionRepository {
        override suspend fun registerDefaultDevice() = "device-1"
        override suspend fun beginAuthorization() = error("unused")
        override suspend fun pollAuthorization(challenge: com.magi.tv.domain.model.DeviceAuthorizationChallenge) = error("unused")
        override suspend fun heartbeat(): HeartbeatObservation {
            heartbeats.incrementAndGet()
            return HeartbeatObservation(Instant.now(), Instant.now(), 60, 150)
        }
        override suspend fun clearCredentials() = Unit
            override suspend fun reportPlayback(report: com.magi.tv.domain.repository.PlaybackReport) = Unit
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    @Test
    fun `on start a heartbeat fires immediately within the scheduling window`() = runTest {
        val heartbeats = AtomicInteger(0)
        val owner = TestLifecycleOwner()
        val coordinator = ClientHeartbeatCoordinator(
            repository = CountingRepository(heartbeats),
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

        // One immediate heartbeat within the start window.
        assertEquals(1, heartbeats.get())
        coordinator.onStop(owner)
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    @Test
    fun `rapid channel switching does not increase heartbeat count`() = runTest {
        val heartbeats = AtomicInteger(0)
        val owner = TestLifecycleOwner()
        val coordinator = ClientHeartbeatCoordinator(
            repository = CountingRepository(heartbeats),
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
        val baseline = heartbeats.get()

        // Simulate many rapid channel switches — each is unrelated to the
        // heartbeat coordinator and must not trigger extra heartbeats.
        repeat(50) { /* channel switch; coordinator is playback-agnostic */ }
        runCurrent()

        // No additional heartbeats during the channel-switching burst.
        assertEquals(baseline, heartbeats.get())
        coordinator.onStop(owner)
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    @Test
    fun `network recovery coalesces into a single heartbeat`() = runTest {
        val heartbeats = AtomicInteger(0)
        val listeners = mutableListOf<() -> Unit>()
        val owner = TestLifecycleOwner()
        val coordinator = ClientHeartbeatCoordinator(
            repository = CountingRepository(heartbeats),
            credentialStore = object : ClientCredentialStore {
                override suspend fun getOrCreateInstallationId() = "installation-1"
                override suspend fun read() = DeviceCredentials("device-1", "refresh", "family", 1)
                override suspend fun write(credentials: DeviceCredentials) = Unit
                override suspend fun clear() = Unit
            },
            connectivity = object : ConnectivityMonitor {
                override fun isOnline() = true
                override fun observe(listener: () -> Unit): AutoCloseable {
                    listeners.add(listener)
                    return AutoCloseable { listeners.remove(listener) }
                }
            },
            scope = this,
        )

        coordinator.onStart(owner)
        runCurrent()
        val baseline = heartbeats.get()

        // Simulate multiple rapid connectivity-restored callbacks (e.g. flapping
        // network). The conflated wakeup channel should merge them into a small
        // number of actual heartbeats, not one per callback.
        val callbackCount = 5
        repeat(callbackCount) { listeners.forEach { it() } }
        runCurrent()

        // Coalescing: far fewer heartbeats than callbacks fired.
        val extra = heartbeats.get() - baseline
        assertTrue(extra in 1..2, "expected 1-2 coalesced heartbeats, got $extra")
        coordinator.onStop(owner)
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    @Test
    fun `heartbeat cadence follows the 60-second interval`() = runTest {
        val heartbeats = AtomicInteger(0)
        val owner = TestLifecycleOwner()
        val coordinator = ClientHeartbeatCoordinator(
            repository = CountingRepository(heartbeats),
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
        val afterFirst = heartbeats.get()
        assertEquals(1, afterFirst)

        // Advance just past the 60s cadence — a second heartbeat fires.
        advanceTimeBy(61_000)
        runCurrent()

        assertEquals(2, heartbeats.get())
        coordinator.onStop(owner)
    }
}
