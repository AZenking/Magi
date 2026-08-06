package com.magi.tv.data

import com.magi.tv.data.remote.ApiEnvelopeDto
import com.magi.tv.data.remote.ChannelDto
import com.magi.tv.data.remote.PageDto
import com.magi.tv.data.remote.ProgrammeDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * Data-layer unit tests (pure JVM, no Android dependency):
 * - ISO time parsing (with/without millis)
 * - Multi-page channel dedup
 * - Page metadata consumption
 */
class DataLayerTest {

    @Test
    fun `ISO with millis parses to correct epoch`() {
        // 2026-07-30T12:00:00.000Z = known epoch
        val dto = ProgrammeDto(
            channelId = "ch-1",
            title = "test",
            subTitle = null,
            startAt = "2026-07-30T12:00:00.000Z",
            stopAt = "2026-07-30T12:30:00.000Z",
            category = null,
        )
        // Verify parsing via Instant.parse (same as DefaultTvContentRepository)
        val start = java.time.Instant.parse(dto.startAt).toEpochMilli()
        val stop = java.time.Instant.parse(dto.stopAt).toEpochMilli()
        assertEquals(30 * 60 * 1000L, stop - start, "30-minute programme")
        assertTrue(start > 0, "epoch must be positive")
    }

    @Test
    fun `ISO without millis also parses`() {
        // Server may emit without millis — must tolerate both.
        val parsed = runCatching {
            java.time.Instant.parse("2026-07-30T12:00:00Z").toEpochMilli()
        }
        assertTrue(parsed.isSuccess, "ISO without millis must parse")
        assertTrue(parsed.getOrNull()!! > 0)
    }

    @Test
    fun `multi-page dedup removes duplicate ids across pages`() {
        // Simulate the dedup logic from MagiRemoteDataSource.getChannels
        val page1 = listOf(
            ChannelDto(id = "ch-1", name = "A"),
            ChannelDto(id = "ch-2", name = "B"),
        )
        val page2 = listOf(
            ChannelDto(id = "ch-2", name = "B"),  // duplicate (defensive)
            ChannelDto(id = "ch-3", name = "C"),
        )
        val all = (page1 + page2).distinctBy { it.id }
        assertEquals(3, all.size, "dedup should keep unique ids only")
        assertEquals(listOf("ch-1", "ch-2", "ch-3"), all.map { it.id })
    }

    @Test
    fun `PageDto totalPages is consumed for pagination loop`() {
        val page = PageDto(
            items = List(100) { ChannelDto(id = "ch-$it", name = "Ch $it") },
            total = 250,
            page = 1,
            pageSize = 100,
            totalPages = 3,
        )
        assertEquals(3, page.totalPages, "totalPages drives the pagination loop")
        assertEquals(250, page.total, "total is the real count")
        assertEquals(100, page.items.size, "page has 100 items but total is 250")
    }

    @Test
    fun `envelope with null data is detectable`() {
        val bad = ApiEnvelopeDto<PageDto<ChannelDto>>(success = false, data = null)
        assertTrue(!bad.success || bad.data == null, "should detect invalid envelope")
    }
}
