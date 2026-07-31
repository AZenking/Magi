package com.magi.tv.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class DeviceAuthorizationRequestDto(
    @SerialName("client_id") val clientId: String,
    @SerialName("device_type") val deviceType: String = "android_tv",
    val platform: String = "android",
    @SerialName("platform_version") val platformVersion: String,
    @SerialName("app_version") val appVersion: String,
    @SerialName("identity_summary") val identitySummary: String,
    @SerialName("suggested_name") val suggestedName: String? = null,
)

@Serializable
data class DeviceRegistrationRequestDto(
    @SerialName("client_id") val clientId: String,
    @SerialName("device_type") val deviceType: String = "android_tv",
    val platform: String = "android",
    @SerialName("platform_version") val platformVersion: String,
    @SerialName("app_version") val appVersion: String,
    @SerialName("identity_summary") val identitySummary: String,
    @SerialName("suggested_name") val suggestedName: String? = null,
    @SerialName("installation_id") val installationId: String,
)

@Serializable
data class DeviceAuthorizationResponseDto(
    @SerialName("device_code") val deviceCode: String,
    @SerialName("user_code") val userCode: String,
    @SerialName("verification_uri") val verificationUri: String,
    @SerialName("verification_uri_complete") val verificationUriComplete: String? = null,
    @SerialName("expires_in") val expiresIn: Int,
    val interval: Int,
)

@Serializable
data class HeartbeatRequestDto(
    @SerialName("app_version") val appVersion: String,
    @SerialName("platform_version") val platformVersion: String,
)

@Serializable
data class HeartbeatResponseDto(
    @SerialName("server_time") val serverTime: String,
    @SerialName("last_active_at") val lastActiveAt: String,
    @SerialName("next_heartbeat_in_seconds") val nextHeartbeatInSeconds: Int,
    @SerialName("online_window_seconds") val onlineWindowSeconds: Int,
    @SerialName("content_revision") val contentRevision: ContentRevisionDto? = null,
)

@Serializable
data class ClientApiEnvelope<T>(
    val success: Boolean = false,
    val data: T? = null,
)
