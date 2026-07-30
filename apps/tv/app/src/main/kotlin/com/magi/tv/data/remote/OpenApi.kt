package com.magi.tv.data.remote

import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface OpenApi {
    @GET("api/open/v1/groups")
    suspend fun groups(): ApiEnvelopeDto<List<ChannelGroupDto>>

    @GET("api/open/v1/channels")
    suspend fun channels(
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 100,
        @Query("group") group: String? = null,
        @Query("search") search: String? = null,
    ): ApiEnvelopeDto<PageDto<ChannelDto>>

    @GET("api/open/v1/channels/{id}/playback")
    suspend fun playback(@Path("id") id: String): ApiEnvelopeDto<PlaybackDecisionDto>

    @GET("api/open/v1/epg")
    suspend fun epg(
        @Query("from") from: String,
        @Query("to") to: String,
        @Query("channelId") channelId: String? = null,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 100,
    ): ApiEnvelopeDto<PageDto<ProgrammeDto>>
}
