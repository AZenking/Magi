package com.magi.tv.domain.repository

import com.magi.tv.domain.model.ChannelCatalog
import com.magi.tv.domain.model.ConnectionSettings
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
}

interface ConnectionSettingsRepository {
    val settings: Flow<ConnectionSettings>

    suspend fun save(settings: ConnectionSettings)
}

interface DiagnosticsRepository {
    val events: Flow<List<DiagnosticEvent>>
    val lastFirstFrameMs: Flow<Long?>

    fun recordEvent(event: DiagnosticEvent)

    fun recordFirstFrame(durationMs: Long)
}
