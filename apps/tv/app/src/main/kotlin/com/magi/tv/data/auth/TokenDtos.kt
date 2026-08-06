package com.magi.tv.data.auth

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class TokenRequest(
    @SerialName("grant_type") val grantType: String,
    @SerialName("client_id") val clientId: String,
    @SerialName("client_secret") val clientSecret: String? = null,
    @SerialName("device_code") val deviceCode: String? = null,
    @SerialName("refresh_token") val refreshToken: String? = null,
)

/**
 * OAuth2 token response. The backend wraps this in { success, data }, so the
 * actual Retrofit return type is [TokenEnvelope].
 */
@Serializable
data class TokenResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("token_type") val tokenType: String = "Bearer",
    @SerialName("expires_in") val expiresIn: Int,
    val scope: String = "open:read client:heartbeat",
    @SerialName("refresh_token") val refreshToken: String? = null,
    @SerialName("refresh_expires_in") val refreshExpiresIn: Int? = null,
    @SerialName("device_client_id") val deviceClientId: String? = null,
)

@Serializable
data class TokenEnvelope(
    val success: Boolean,
    val data: TokenResponse? = null,
)
