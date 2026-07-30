package com.magi.tv.data.repository

import com.magi.tv.data.remote.ChannelDto
import com.magi.tv.data.remote.ChannelGroupDto
import com.magi.tv.data.remote.MagiRemoteDataSource
import com.magi.tv.data.remote.PlaybackDecisionDto
import com.magi.tv.data.remote.PlaybackLineDto
import com.magi.tv.data.remote.ProgrammeDto
import com.magi.tv.domain.model.Channel
import com.magi.tv.domain.model.ChannelCatalog
import com.magi.tv.domain.model.ChannelGroup
import com.magi.tv.domain.model.PlaybackDecision
import com.magi.tv.domain.model.PlaybackLine
import com.magi.tv.domain.model.Programme
import com.magi.tv.domain.repository.TvContentRepository
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class DefaultTvContentRepository(
    private val remoteDataSource: MagiRemoteDataSource,
) : TvContentRepository {
    override suspend fun getChannelCatalog(group: String?): ChannelCatalog =
        ChannelCatalog(
            groups = remoteDataSource.getGroups().map(ChannelGroupDto::toDomain),
            channels = remoteDataSource.getChannels(group).map(ChannelDto::toDomain),
        )

    override suspend fun resolvePlayback(channelId: String): PlaybackDecision =
        remoteDataSource.getPlayback(channelId).toDomain()

    override suspend fun getProgrammeGuide(
        channelId: String?,
        fromEpochMs: Long,
        toEpochMs: Long,
    ): List<Programme> =
        remoteDataSource.getProgrammeGuide(
            channelId = channelId,
            fromIso = fromEpochMs.toIsoUtc(),
            toIso = toEpochMs.toIsoUtc(),
        ).map(ProgrammeDto::toDomain)
}

private fun ChannelGroupDto.toDomain() = ChannelGroup(
    name = name,
    count = count,
)

private fun ChannelDto.toDomain() = Channel(
    id = id,
    name = name,
    group = group,
    logo = logo,
    channelNumber = channelNumber,
)

private fun PlaybackLineDto.toDomain() = PlaybackLine(
    streamId = streamId,
    url = url,
    format = format,
    health = health,
)

private fun PlaybackDecisionDto.toDomain() = PlaybackDecision(
    channelId = channelId,
    playable = playable,
    primary = primary?.toDomain(),
    fallbacks = fallbacks.map(PlaybackLineDto::toDomain),
    decisionExpiresAt = decisionExpiresAt,
    deliveryMode = deliveryMode,
)

private fun ProgrammeDto.toDomain() = Programme(
    channelId = channelId,
    title = title,
    subTitle = subTitle,
    startAt = startAt,
    stopAt = stopAt,
    category = category,
)

private fun Long.toIsoUtc(): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date(this))
