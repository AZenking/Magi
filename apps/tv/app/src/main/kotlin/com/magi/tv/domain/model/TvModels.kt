package com.magi.tv.domain.model

/** Framework-free models consumed by the TV presentation layer. */
data class ChannelGroup(
    val name: String?,
    val count: Int,
)

data class Channel(
    val id: String,
    val name: String,
    val group: String?,
    val logo: String?,
    val channelNumber: Int?,
)

data class ChannelCatalog(
    val groups: List<ChannelGroup>,
    val channels: List<Channel>,
)

data class PlaybackLine(
    val streamId: String,
    val url: String,
    val format: String?,
    val health: String,
)

data class PlaybackDecision(
    val channelId: String,
    val playable: Boolean,
    val primary: PlaybackLine?,
    val fallbacks: List<PlaybackLine>,
    val decisionExpiresAt: String,
    val deliveryMode: String,
) {
    val orderedLines: List<PlaybackLine>
        get() = listOfNotNull(primary) + fallbacks
}

data class Programme(
    val channelId: String,
    val title: String?,
    val subTitle: String?,
    /** Epoch milliseconds. Parsed once in the data layer (Instant.parse). */
    val startAt: Long,
    val stopAt: Long,
    val category: String?,
)

data class ConnectionSettings(
    val serverUrl: String = "",
    val apiKey: String = "",
) {
    val isConfigured: Boolean
        get() = serverUrl.isNotBlank() && apiKey.isNotBlank()
}

enum class PlaybackErrorKind(val label: String) {
    Network("网络错误"),
    Http("HTTP 错误"),
    Source("播放源错误"),
    Decoder("解码错误"),
    Unknown("未知错误"),
}

data class DiagnosticEvent(
    val timestampMs: Long,
    val kind: PlaybackErrorKind,
    val message: String,
    val lineStreamId: String?,
)
