package com.magi.tv.ui.channels

import com.magi.tv.domain.model.Programme
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

/**
 * The viewport used by the TV EPG grid.
 *
 * The anchor is deliberately represented as an epoch value at the UI boundary:
 * programme timestamps already use epoch milliseconds, and this keeps placement
 * arithmetic independent from the device timezone. Date changes happen through
 * [forDate], which preserves the user's local wall-clock time.
 */
data class EpgTimeWindow(
    val anchorAt: Long,
    val startAt: Long,
    val endAt: Long,
    val stepMs: Long = STEP_MS,
) {
    init {
        require(stepMs > 0) { "EPG step must be positive" }
        require(startAt < anchorAt) { "EPG start must precede its anchor" }
        require(anchorAt < endAt) { "EPG anchor must precede its end" }
    }

    /** Shift the viewport by whole time ticks without changing its duration. */
    fun shift(steps: Int): EpgTimeWindow {
        val delta = steps.toLong() * stepMs
        return copy(anchorAt = anchorAt + delta, startAt = startAt + delta, endAt = endAt + delta)
    }

    /** Keep the same local time-of-day when the user chooses another date. */
    fun forDate(date: LocalDate, zone: ZoneId): EpgTimeWindow =
        around(date, Instant.ofEpochMilli(anchorAt).atZone(zone).toLocalTime(), zone, stepMs)

    companion object {
        const val STEP_MS: Long = 30 * 60 * 1_000L
        const val HALF_WINDOW_MS: Long = 2 * 60 * 60 * 1_000L

        /** Build today's viewport around the current local wall-clock time. */
        fun aroundNow(nowAt: Long, zone: ZoneId = ZoneId.systemDefault()): EpgTimeWindow {
            val now = Instant.ofEpochMilli(nowAt).atZone(zone)
            val roundedMinute = (now.minute / 30) * 30
            val localAnchor = LocalDateTime.of(
                now.toLocalDate(),
                LocalTime.of(now.hour, roundedMinute),
            )
            return around(localAnchor.toLocalDate(), localAnchor.toLocalTime(), zone)
        }

        /** Build a viewport around a local time, allowing the window to cross midnight. */
        fun around(
            date: LocalDate,
            localTime: LocalTime,
            zone: ZoneId = ZoneId.systemDefault(),
            stepMs: Long = STEP_MS,
        ): EpgTimeWindow {
            val anchor = date.atTime(localTime).atZone(zone).toInstant().toEpochMilli()
            return EpgTimeWindow(
                anchorAt = anchor,
                startAt = anchor - HALF_WINDOW_MS,
                endAt = anchor + HALF_WINDOW_MS,
                stepMs = stepMs,
            )
        }
    }
}

/** A programme clipped to the visible EPG window. */
data class EpgProgrammePlacement(
    val programme: Programme,
    val startOffsetMs: Long,
    val durationMs: Long,
    val clippedStart: Boolean,
    val clippedEnd: Boolean,
)

/**
 * Convert a programme to a time-lane placement. A null result means the
 * programme does not intersect the viewport at all.
 */
fun Programme.placementIn(window: EpgTimeWindow): EpgProgrammePlacement? {
    if (stopAt <= window.startAt || startAt >= window.endAt || stopAt <= startAt) return null
    val visibleStart = maxOf(startAt, window.startAt)
    val visibleEnd = minOf(stopAt, window.endAt)
    return EpgProgrammePlacement(
        programme = this,
        startOffsetMs = (visibleStart - window.startAt).coerceAtLeast(0L),
        durationMs = (visibleEnd - visibleStart).coerceAtLeast(1L),
        clippedStart = startAt < window.startAt,
        clippedEnd = stopAt > window.endAt,
    )
}

/** Format a time tick using the device's current timezone. */
fun Long.toEpgTimeLabel(zone: ZoneId = ZoneId.systemDefault()): String =
    Instant.ofEpochMilli(this).atZone(zone).format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))

/** Round an epoch timestamp down to the nearest EPG tick. */
fun Long.floorToEpgStep(stepMs: Long = EpgTimeWindow.STEP_MS): Long {
    require(stepMs > 0) { "EPG step must be positive" }
    return (this / stepMs) * stepMs
}
