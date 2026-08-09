package com.magi.tv.ui.channels

import com.magi.tv.domain.model.Programme
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

class EpgTimeWindowTest {
    private val zone = ZoneId.of("Asia/Shanghai")

    @Test
    fun `today window rounds anchor down to half hour and spans four hours`() {
        val now = LocalDate.of(2026, 8, 9)
            .atTime(10, 47)
            .atZone(zone)
            .toInstant()
            .toEpochMilli()

        val window = EpgTimeWindow.aroundNow(now, zone)

        assertEquals("10:30", window.anchorAt.toEpgTimeLabel(zone))
        assertEquals("08:30", window.startAt.toEpgTimeLabel(zone))
        assertEquals("12:30", window.endAt.toEpgTimeLabel(zone))
        assertEquals(EpgTimeWindow.STEP_MS, window.stepMs)
    }

    @Test
    fun `date change preserves local wall clock`() {
        val source = EpgTimeWindow.around(
            date = LocalDate.of(2026, 8, 9),
            localTime = LocalTime.of(20, 15),
            zone = zone,
        )

        val nextDay = source.forDate(LocalDate.of(2026, 8, 10), zone)

        assertEquals("20:15", nextDay.anchorAt.toEpgTimeLabel(zone))
        assertEquals("18:15", nextDay.startAt.toEpgTimeLabel(zone))
        assertEquals("22:15", nextDay.endAt.toEpgTimeLabel(zone))
    }

    @Test
    fun `window is allowed to cross midnight`() {
        val window = EpgTimeWindow.around(
            date = LocalDate.of(2026, 8, 10),
            localTime = LocalTime.of(0, 15),
            zone = zone,
        )

        assertEquals("22:15", window.startAt.toEpgTimeLabel(zone))
        assertEquals("00:15", window.anchorAt.toEpgTimeLabel(zone))
        assertEquals("02:15", window.endAt.toEpgTimeLabel(zone))
        assertEquals(
            LocalDate.of(2026, 8, 9),
            Instant.ofEpochMilli(window.startAt).atZone(zone).toLocalDate(),
        )
    }

    @Test
    fun `placement clips overlap and rejects programmes outside window`() {
        val window = EpgTimeWindow.around(
            date = LocalDate.of(2026, 8, 9),
            localTime = LocalTime.of(12, 0),
            zone = zone,
        )
        val clipped = programme("09:00", "11:00", zone).placementIn(window)
        val inside = programme("11:00", "12:30", zone).placementIn(window)
        val outside = programme("20:00", "21:00", zone).placementIn(window)

        assertEquals(0L, clipped?.startOffsetMs)
        assertEquals(60 * 60 * 1_000L, clipped?.durationMs)
        assertTrue(clipped?.clippedStart == true)
        assertFalse(clipped?.clippedEnd == true)
        assertEquals(60 * 60 * 1_000L, inside?.startOffsetMs)
        assertEquals(90 * 60 * 1_000L, inside?.durationMs)
        assertFalse(inside?.clippedStart == true)
        assertNull(outside)
    }

    @Test
    fun `placements preserve gaps overlaps and long programme clipping`() {
        val window = EpgTimeWindow.around(
            date = LocalDate.of(2026, 8, 9),
            localTime = LocalTime.of(12, 0),
            zone = zone,
        )

        val longProgramme = programme("09:00", "15:00", zone).placementIn(window)
        val overlappingProgramme = programme("12:30", "13:30", zone).placementIn(window)
        val gapProgramme = programme("16:00", "17:00", zone).placementIn(window)

        assertEquals(0L, longProgramme?.startOffsetMs)
        assertEquals(4 * 60 * 60 * 1_000L, longProgramme?.durationMs)
        assertTrue(longProgramme?.clippedStart == true)
        assertTrue(longProgramme?.clippedEnd == true)
        assertEquals(150 * 60 * 1_000L, overlappingProgramme?.startOffsetMs)
        assertEquals(60 * 60 * 1_000L, overlappingProgramme?.durationMs)
        assertNull(gapProgramme)
    }

    @Test
    fun `shift moves anchor and bounds by one tick`() {
        val window = EpgTimeWindow.around(
            date = LocalDate.of(2026, 8, 9),
            localTime = LocalTime.of(12, 0),
            zone = zone,
        )

        val shifted = window.shift(1)

        assertEquals(window.anchorAt + EpgTimeWindow.STEP_MS, shifted.anchorAt)
        assertEquals(window.startAt + EpgTimeWindow.STEP_MS, shifted.startAt)
        assertEquals(window.endAt + EpgTimeWindow.STEP_MS, shifted.endAt)
    }

    private fun programme(start: String, stop: String, zone: ZoneId): Programme {
        val date = LocalDate.of(2026, 8, 9)
        fun epoch(value: String) = date.atTime(LocalTime.parse(value)).atZone(zone).toInstant().toEpochMilli()
        return Programme(
            channelId = "magi:channel-1",
            title = "Test programme",
            subTitle = null,
            startAt = epoch(start),
            stopAt = epoch(stop),
            category = null,
        )
    }
}
