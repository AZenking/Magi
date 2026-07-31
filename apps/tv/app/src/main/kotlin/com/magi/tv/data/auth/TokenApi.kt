package com.magi.tv.data.auth

import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Retrofit interface for the OAuth2 token endpoint.
 * POST /api/open/v1/auth/token
 */
interface TokenApi {
    @POST("api/open/v1/auth/token")
    suspend fun token(@Body request: TokenRequest): TokenEnvelope
}
