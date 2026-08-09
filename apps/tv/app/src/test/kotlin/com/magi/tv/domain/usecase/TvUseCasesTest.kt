package com.magi.tv.domain.usecase

import com.magi.tv.domain.model.ChannelCatalog
import com.magi.tv.domain.model.PlaybackDecision
import com.magi.tv.domain.model.PlaybackLine
import com.magi.tv.domain.model.Programme
import com.magi.tv.domain.repository.TvContentRepository
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class TvUseCasesTest {
    @Test
    fun `resolve playback normalizes channel id and accepts ordered lines`() = runBlocking {
        val repository = FakeTvContentRepository(
            playbackDecision = playableDecision(),
        )

        val result = ResolvePlaybackUseCase(repository)("magi:channel-1")

        assertEquals("channel-1", repository.requestedPlaybackChannelId)
        assertIs<PlaybackResolution.Ready>(result)
        assertEquals(2, result.decision.orderedLines.size)
        Unit
    }

    @Test
    fun `resolve playback rejects decision without usable lines`() = runBlocking {
        val repository = FakeTvContentRepository(
            playbackDecision = playableDecision().copy(
                primary = null,
                fallbacks = emptyList(),
            ),
        )

        val result = ResolvePlaybackUseCase(repository)("channel-1")

        assertIs<PlaybackResolution.Unavailable>(result)
        Unit
    }

    @Test
    fun `programme guide passes explicit time range to repository`() = runBlocking {
        val repository = FakeTvContentRepository(
            playbackDecision = playableDecision(),
        )
        val from = 1_700_000_000_000L
        val to = from + 24 * 60 * 60 * 1000L

        GetProgrammeGuideUseCase(repository)("magi:channel-1", from, to)

        assertEquals("channel-1", repository.requestedGuideChannelId)
        assertEquals(from, repository.requestedGuideFrom)
        assertEquals(to, repository.requestedGuideTo)
        Unit
    }

    @Test
    fun `programme guide batch normalizes ids and keeps one explicit window`() = runBlocking {
        val repository = FakeTvContentRepository(
            playbackDecision = playableDecision(),
        )
        val from = 1_700_000_000_000L
        val to = from + 4 * 60 * 60 * 1_000L

        GetProgrammeGuideUseCase(repository).batch(listOf("magi:channel-1", "channel-2"), from, to)

        assertEquals(listOf("channel-1", "channel-2"), repository.requestedGuideChannelIds)
        assertEquals(from, repository.requestedGuideFrom)
        assertEquals(to, repository.requestedGuideTo)
        Unit
    }
}

private class FakeTvContentRepository(
    private val playbackDecision: PlaybackDecision,
) : TvContentRepository {
    var requestedPlaybackChannelId: String? = null
    var requestedGuideChannelId: String? = null
    var requestedGuideChannelIds: List<String>? = null
    var requestedGuideFrom: Long? = null
    var requestedGuideTo: Long? = null

    override suspend fun getProgrammeGuideBatch(
        channelIds: Collection<String>,
        fromEpochMs: Long,
        toEpochMs: Long,
    ): Map<String, List<Programme>> {
        requestedGuideChannelIds = channelIds.toList()
        requestedGuideFrom = fromEpochMs
        requestedGuideTo = toEpochMs
        return channelIds.associate { it.removePrefix("magi:") to emptyList() }
    }

    override suspend fun getChannelCatalog(group: String?): ChannelCatalog =
        ChannelCatalog(emptyList(), emptyList())

    override suspend fun resolvePlayback(channelId: String): PlaybackDecision {
        requestedPlaybackChannelId = channelId
        return playbackDecision
    }

    override suspend fun getProgrammeGuide(
        channelId: String?,
        fromEpochMs: Long,
        toEpochMs: Long,
    ): List<Programme> {
        requestedGuideChannelId = channelId
        requestedGuideFrom = fromEpochMs
        requestedGuideTo = toEpochMs
        return emptyList()
    }
}

private fun playableDecision() = PlaybackDecision(
    channelId = "channel-1",
    playable = true,
    primary = PlaybackLine(
        streamId = "primary",
        url = "https://example.com/live.m3u8",
        format = "hls",
        health = "healthy",
    ),
    fallbacks = listOf(
        PlaybackLine(
            streamId = "fallback",
            url = "https://example.com/fallback.m3u8",
            format = "hls",
            health = "healthy",
        ),
    ),
    decisionExpiresAt = "2026-07-30T12:00:00Z",
    deliveryMode = "direct",
)
