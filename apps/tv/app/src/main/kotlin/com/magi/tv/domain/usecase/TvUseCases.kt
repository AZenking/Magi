package com.magi.tv.domain.usecase

import com.magi.tv.domain.model.ChannelCatalog
import com.magi.tv.domain.model.PlaybackDecision
import com.magi.tv.domain.model.Programme
import com.magi.tv.domain.repository.TvContentRepository

fun interface Clock {
    fun nowEpochMs(): Long
}

object SystemClock : Clock {
    override fun nowEpochMs(): Long = System.currentTimeMillis()
}

class GetChannelCatalogUseCase(
    private val repository: TvContentRepository,
) {
    suspend operator fun invoke(group: String? = null): ChannelCatalog =
        repository.getChannelCatalog(group)
}

sealed interface PlaybackResolution {
    data class Ready(val decision: PlaybackDecision) : PlaybackResolution
    data class Unavailable(val message: String) : PlaybackResolution
}

class ResolvePlaybackUseCase(
    private val repository: TvContentRepository,
) {
    suspend operator fun invoke(channelId: String): PlaybackResolution {
        val normalizedId = channelId.removePrefix("magi:")
        val decision = repository.resolvePlayback(normalizedId)
        return if (decision.playable && decision.orderedLines.isNotEmpty()) {
            PlaybackResolution.Ready(decision)
        } else {
            PlaybackResolution.Unavailable("该频道暂无可用播放线路")
        }
    }
}

class GetProgrammeGuideUseCase(
    private val repository: TvContentRepository,
    private val clock: Clock = SystemClock,
) {
    /**
     * Query the guide for [channelId] within an explicit [fromEpochMs, toEpochMs]
     * window. The caller MUST pass the time range — no hidden 12h default — so
     * the ViewModel's day-boundary computation is the single source of truth.
     * Pass channelId=null for an all-channels query.
     */
    suspend operator fun invoke(
        channelId: String?,
        fromEpochMs: Long,
        toEpochMs: Long,
    ): List<Programme> = repository.getProgrammeGuide(
        channelId = channelId
            ?.takeIf { it.isNotBlank() }
            ?.removePrefix("magi:"),
        fromEpochMs = fromEpochMs,
        toEpochMs = toEpochMs,
    )

    suspend fun batch(
        channelIds: Collection<String>,
        fromEpochMs: Long,
        toEpochMs: Long,
    ): Map<String, List<Programme>> = repository.getProgrammeGuideBatch(
        channelIds = channelIds
            .map { it.removePrefix("magi:") }
            .distinct(),
        fromEpochMs = fromEpochMs,
        toEpochMs = toEpochMs,
    )

    suspend fun isStale(
        channelId: String,
        fromEpochMs: Long,
        toEpochMs: Long,
    ): Boolean = repository.isProgrammeGuideStale(
        channelId = channelId.removePrefix("magi:"),
        fromEpochMs = fromEpochMs,
        toEpochMs = toEpochMs,
    )
}
