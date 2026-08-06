package com.magi.tv.playback

/**
 * ExoPlayer playback state, surfaced as a stable UI-friendly label.
 * Mirrors [androidx.media3.common.Player] playback states without leaking
 * the framework constant into the presentation layer.
 */
enum class PlaybackStateLabel { IDLE, BUFFERING, READY, ENDED }

/**
 * Real-time playback metrics for the "Stats for nerds"–style side panel
 * (YouTube-style). All fields are populated by [Media3PlaybackSession]'s
 * AnalyticsListener (event-driven) plus [Media3PlaybackSession.refreshDerivedStats]
 * (polled for buffer health / state).
 *
 * Fields default to "unknown" sentinels so the panel can render a full grid
 * before the first stream reports any data.
 */
data class PlaybackStats(
    val state: PlaybackStateLabel = PlaybackStateLabel.IDLE,
    val videoWidth: Int = 0,
    val videoHeight: Int = 0,
    /** Declared frame rate from the Format; 0 when unknown. */
    val frameRate: Float = 0f,
    val videoCodec: String? = null,
    val videoProfile: String? = null,
    /** Declared video bitrate in bits/s; null when unknown. */
    val videoBitrate: Int? = null,
    val audioCodec: String? = null,
    val audioChannels: Int = 0,
    /** Declared audio sample rate in Hz; 0 when unknown. */
    val audioSampleRate: Int = 0,
    /** Declared audio bitrate in bits/s; null when unknown. */
    val audioBitrate: Int? = null,
    /** Cumulative dropped video frames since the line started. */
    val droppedFrames: Long = 0L,
    /** Current bandwidth estimate in bits/s (bandwidth meter). */
    val bandwidthBps: Long = 0L,
    /** Buffer ahead of the playhead, in ms. */
    val bufferHealthMs: Long = 0L,
    /** Demasked stream host (no path / token — constitution VIII). */
    val streamHost: String? = null,
)
