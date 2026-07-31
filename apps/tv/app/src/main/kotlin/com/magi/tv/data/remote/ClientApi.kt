package com.magi.tv.data.remote

import com.magi.tv.data.auth.TokenResponse
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.Headers
import retrofit2.http.POST

interface ClientApi {
    @Headers("Content-Type: application/json")
    @POST("api/open/v1/auth/device-register")
    suspend fun registerDevice(
        @Body request: DeviceRegistrationRequestDto,
    ): ClientApiEnvelope<TokenResponse>

    @Headers("Content-Type: application/json")
    @POST("api/open/v1/auth/device-authorization")
    suspend fun beginAuthorization(
        @Body request: DeviceAuthorizationRequestDto,
    ): ClientApiEnvelope<DeviceAuthorizationResponseDto>

    @Headers("Content-Type: application/json")
    @POST("api/open/v1/device-clients/heartbeat")
    suspend fun heartbeat(
        @Header("Authorization") authorization: String,
        @Body request: HeartbeatRequestDto,
    ): ClientApiEnvelope<HeartbeatResponseDto>
}
