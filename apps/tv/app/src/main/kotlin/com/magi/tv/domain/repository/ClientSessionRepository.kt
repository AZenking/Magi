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
}

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
