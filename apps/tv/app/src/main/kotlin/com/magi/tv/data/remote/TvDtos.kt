package com.magi.tv.data.remote

import kotlinx.serialization.Serializable

/** Wire-only representations of the Magi open API. */
@Serializable
data class ApiEnvelopeDto<T>(
    val success: Boolean = false,
    val data: T? = null,
)

@Serializable
data class PageDto<T>(
    val items: List<T> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 50,
    val totalPages: Int = 1,
)

@Serializable
data class ChannelGroupDto(
    val name: String? = null,
    val count: Int = 0,
)

@Serializable
data class ChannelDto(
    val id: String,
    val name: String,
    val group: String? = null,
    val logo: String? = null,
    val channelNumber: Int? = null,
)

@Serializable
data class PlaybackLineDto(
    val streamId: String,
    val url: String,
    val format: String? = null,
    val health: String,
)

@Serializable
data class PlaybackDecisionDto(
    val channelId: String,
    val playable: Boolean,
    val primary: PlaybackLineDto? = null,
    val fallbacks: List<PlaybackLineDto> = emptyList(),
    val decisionExpiresAt: String,
    val deliveryMode: String = "direct",
)

@Serializable
data class ProgrammeDto(
    val channelId: String,
    val title: String? = null,
    val subTitle: String? = null,
    val startAt: String,
    val stopAt: String,
    val category: String? = null,
)
