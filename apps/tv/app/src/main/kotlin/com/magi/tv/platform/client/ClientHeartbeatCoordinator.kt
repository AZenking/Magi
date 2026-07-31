package com.magi.tv.platform.client

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import com.magi.tv.domain.repository.ClientCredentialStore
import com.magi.tv.domain.repository.ClientSessionRepository
import com.magi.tv.domain.repository.ContentSyncRepository
import com.magi.tv.domain.repository.ConnectivityMonitor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.selects.onTimeout
import kotlinx.coroutines.selects.select
import kotlin.math.min
import kotlin.random.Random

/** Sends only foreground liveness heartbeats and never starts Media3 work. */
class ClientHeartbeatCoordinator(
    private val repository: ClientSessionRepository,
    private val credentialStore: ClientCredentialStore,
    private val connectivity: ConnectivityMonitor,
    private val contentSyncRepository: ContentSyncRepository? = null,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) : DefaultLifecycleObserver {
    private val heartbeatMutex = Mutex()
    private val wakeups = Channel<Unit>(Channel.CONFLATED)
    private var heartbeatJob: Job? = null
    private var networkSubscription: AutoCloseable? = null
    private var contentSyncJob: Job? = null
    private var generation = 0L

    /** Wakes the loop immediately after first-run registration succeeds. */
    fun wake() {
        wakeups.trySend(Unit)
    }

    @Synchronized
    override fun onStart(owner: LifecycleOwner) {
        if (heartbeatJob?.isActive == true) return
        val currentGeneration = ++generation
        networkSubscription = connectivity.observe { wakeups.trySend(Unit) }
        heartbeatJob = scope.launch { runLoop(currentGeneration) }
    }

    @Synchronized
    override fun onStop(owner: LifecycleOwner) {
        generation++
        heartbeatJob?.cancel()
        contentSyncJob?.cancel()
        contentSyncJob = null
        heartbeatJob = null
        networkSubscription?.close()
        networkSubscription = null
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    private suspend fun runLoop(currentGeneration: Long) {
        var intervalSeconds = DEFAULT_INTERVAL_SECONDS
        var failures = 0
        while (currentGeneration == generation) {
            if (credentialStore.read() != null && connectivity.isOnline()) {
                try {
                    heartbeatMutex.withLock {
                        if (currentGeneration == generation) {
                            val observation = repository.heartbeat()
                            intervalSeconds = observation.nextHeartbeatInSeconds
                            failures = 0
                            val revision = observation.contentRevision
                            if (revision != null && contentSyncRepository != null) {
                                contentSyncJob?.cancel()
                                contentSyncJob = scope.launch {
                                    runCatching {
                                        contentSyncRepository.syncIfChanged(revision)
                                    }
                                }
                            }
                        }
                    }
                } catch (_: Exception) {
                    failures = (failures + 1).coerceAtMost(MAX_FAILURE_EXPONENT)
                    val backoff = min(
                        MAX_BACKOFF_SECONDS,
                        DEFAULT_INTERVAL_SECONDS * (1 shl failures),
                    )
                    intervalSeconds = backoff
                }
            } else {
                failures = 0
                intervalSeconds = DEFAULT_INTERVAL_SECONDS
            }

            val jitterMs = if (failures == 0) 0L else Random.nextLong(0L, MAX_JITTER_MS)
            select<Unit> {
                wakeups.onReceive { }
                onTimeout(intervalSeconds * 1000L + jitterMs) { }
            }
        }
    }

    companion object {
        private const val DEFAULT_INTERVAL_SECONDS = 60
        private const val MAX_BACKOFF_SECONDS = 300
        private const val MAX_FAILURE_EXPONENT = 3
        private const val MAX_JITTER_MS = 5_000L
    }
}
