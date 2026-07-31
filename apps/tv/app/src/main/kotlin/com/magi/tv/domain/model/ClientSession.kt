package com.magi.tv.domain.model

import java.time.Instant

sealed interface ClientSessionState {
    data object Unregistered : ClientSessionState
    data class Authorizing(
        val userCode: String,
        val verificationUri: String,
        val deviceCode: String,
        val expiresAt: Instant,
        val intervalSeconds: Int,
        val statusMessage: String? = null,
    ) : ClientSessionState
    data class RegisteredBackground(val deviceClientId: String) : ClientSessionState
    data class Heartbeating(val deviceClientId: String) : ClientSessionState
    data class HealthyForeground(val deviceClientId: String, val lastHeartbeatAt: Instant) : ClientSessionState
    data class Backoff(val deviceClientId: String, val retryAt: Instant, val message: String) : ClientSessionState
    data object RequiresAuthorization : ClientSessionState
}

data class DeviceAuthorizationChallenge(
    val deviceCode: String,
    val userCode: String,
    val verificationUri: String,
    val expiresAt: Instant,
    val intervalSeconds: Int,
)

data class DeviceCredentials(
    val deviceClientId: String,
    val refreshToken: String,
    val familyId: String,
    val generation: Int,
)

data class HeartbeatObservation(
    val serverTime: Instant,
    val lastActiveAt: Instant,
    val nextHeartbeatInSeconds: Int,
    val onlineWindowSeconds: Int,
    val contentRevision: ContentRevision? = null,
)

enum class ClientAuthorizationReason { FIRST_RUN, EXPIRED, DENIED, REVOKED, INVALID_CREDENTIALS }
