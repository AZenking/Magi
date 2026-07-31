package com.magi.tv.data.auth

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * OAuth2 Client Credentials Grant request (RFC 6749 §4.4).
 *
 * Matches the backend TokenRequestSchema in @magi/types.
 */
@Serializable
data class TokenRequest(
    @SerialName("grant_type") val grantType: String = "client_credentials",
    @SerialName("client_id") val clientId: String,
    @SerialName("client_secret") val clientSecret: String,
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
)

@Serializable
data class TokenEnvelope(
    val success: Boolean,
    val data: TokenResponse? = null,
)
