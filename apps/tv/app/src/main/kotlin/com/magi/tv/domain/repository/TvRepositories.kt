package com.magi.tv.domain.repository

import com.magi.tv.domain.model.ChannelCatalog
import com.magi.tv.domain.model.ContentChange
import com.magi.tv.domain.model.ContentRevision
import com.magi.tv.domain.model.DiagnosticEvent
import com.magi.tv.domain.model.PlaybackDecision
import com.magi.tv.domain.model.Programme
import kotlinx.coroutines.flow.Flow

/** Single entry point for remote TV content. UI code never sees Retrofit DTOs. */
interface TvContentRepository {
    suspend fun getChannelCatalog(group: String? = null): ChannelCatalog

    suspend fun resolvePlayback(channelId: String): PlaybackDecision

    suspend fun getProgrammeGuide(
        channelId: String?,
        fromEpochMs: Long,
        toEpochMs: Long,
    ): List<Programme>

    /** Fetches several channels in one content-snapshot request when supported. */
    suspend fun getProgrammeGuideBatch(
        channelIds: Collection<String>,
        fromEpochMs: Long,
        toEpochMs: Long,
    ): Map<String, List<Programme>> = channelIds
        .map { it.removePrefix("magi:") }
        .distinct()
        .associateWith { channelId ->
            getProgrammeGuide(channelId, fromEpochMs, toEpochMs)
        }

    suspend fun isProgrammeGuideStale(
        channelId: String,
        fromEpochMs: Long,
        toEpochMs: Long,
    ): Boolean = false
}

/** Receives content invalidation tokens from the foreground heartbeat. */
interface ContentSyncRepository {
    val changes: Flow<ContentChange>

    suspend fun syncIfChanged(revision: ContentRevision)
}

interface DiagnosticsRepository {
    val events: Flow<List<DiagnosticEvent>>
    val lastFirstFrameMs: Flow<Long?>

    fun recordEvent(event: DiagnosticEvent)

    fun recordFirstFrame(durationMs: Long)
}
