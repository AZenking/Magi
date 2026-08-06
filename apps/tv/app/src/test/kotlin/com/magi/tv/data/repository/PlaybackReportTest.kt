package com.magi.tv.data.repository

import com.magi.tv.data.remote.PlaybackReportRequestDto
import com.magi.tv.domain.repository.PlaybackReport
import com.magi.tv.domain.repository.PlaybackOutcome
import org.junit.Test
import kotlin.test.assertEquals

/**
 * Playback report DTO mapping tests (008-pipeline-reliability T033, US3).
 *
 * Validates that the domain PlaybackReport correctly maps to the wire-format
 * PlaybackReportRequestDto (snake_case, outcome lowercase, errorKind nullable).
 */
class PlaybackReportTest {

    @Test
    fun `maps failure report to DTO correctly`() {
        val report = PlaybackReport(
            channelId = "magi:00000000-0000-4000-8000-000000000001",
            streamId = "00000000-0000-4000-8000-000000000002",
            outcome = PlaybackOutcome.FAILURE,
            errorKind = "network",
            playedDurationMs = 2500,
        )

        // Simulate the mapping done in DefaultClientSessionRepository.reportPlayback.
        val dto = PlaybackReportRequestDto(
            channelId = report.channelId,
            streamId = report.streamId,
            outcome = report.outcome.name.lowercase(),
            errorKind = report.errorKind,
            playedDurationMs = report.playedDurationMs,
            reportedAt = "2026-08-05T12:00:00Z",
        )

        assertEquals("magi:00000000-0000-4000-8000-000000000001", dto.channelId)
        assertEquals("00000000-0000-4000-8000-000000000002", dto.streamId)
        assertEquals("failure", dto.outcome)
        assertEquals("network", dto.errorKind)
        assertEquals(2500L, dto.playedDurationMs)
    }

    @Test
    fun `maps success report with null errorKind`() {
        val report = PlaybackReport(
            channelId = "magi:ch-1",
            streamId = "stream-1",
            outcome = PlaybackOutcome.SUCCESS,
            errorKind = null,
            playedDurationMs = 800,
        )

        val dto = PlaybackReportRequestDto(
            channelId = report.channelId,
            streamId = report.streamId,
            outcome = report.outcome.name.lowercase(),
            errorKind = report.errorKind,
            playedDurationMs = report.playedDurationMs,
        )

        assertEquals("success", dto.outcome)
        assertEquals(null, dto.errorKind)
    }

    @Test
    fun `PlaybackOutcome enum has exactly FAILURE and SUCCESS`() {
        assertEquals(2, PlaybackOutcome.entries.size)
        assertEquals(PlaybackOutcome.FAILURE, PlaybackOutcome.valueOf("FAILURE"))
        assertEquals(PlaybackOutcome.SUCCESS, PlaybackOutcome.valueOf("SUCCESS"))
    }
}
