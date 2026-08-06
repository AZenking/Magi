package com.magi.tv.domain.repository

import com.magi.tv.domain.model.ClientSessionState
import com.magi.tv.domain.model.DeviceAuthorizationChallenge
import com.magi.tv.domain.model.HeartbeatObservation

interface ClientSessionRepository {
    suspend fun registerDefaultDevice(): String
    suspend fun beginAuthorization(): DeviceAuthorizationChallenge
    suspend fun pollAuthorization(challenge: DeviceAuthorizationChallenge): PollResult
    suspend fun heartbeat(): HeartbeatObservation
    suspend fun clearCredentials()

    /**
     * Report a playback outcome (failure or success) for a stream line.
     * Best-effort: failures are silently swallowed and do not affect playback.
     * (008-pipeline-reliability US3)
     */
    suspend fun reportPlayback(report: PlaybackReport)
}

/**
 * Domain-level playback report sent to the server.
 */
data class PlaybackReport(
    val channelId: String,
    val streamId: String,
    val outcome: PlaybackOutcome,
    val errorKind: String? = null,
    val playedDurationMs: Long = 0,
)

enum class PlaybackOutcome { FAILURE, SUCCESS }

sealed interface PollResult {
    data object Pending : PollResult
    data class SlowDown(val intervalSeconds: Int) : PollResult
    data class Authorized(val deviceClientId: String) : PollResult
    data object Denied : PollResult
    data object Expired : PollResult
    data class TemporaryFailure(val message: String) : PollResult
}

interface ConnectivityMonitor {
    fun isOnline(): Boolean
    fun observe(listener: () -> Unit): AutoCloseable
}

interface HeartbeatPort {
    suspend fun send(): HeartbeatObservation
}
