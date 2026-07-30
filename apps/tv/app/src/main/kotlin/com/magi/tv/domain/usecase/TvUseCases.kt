package com.magi.tv.domain.usecase

import com.magi.tv.domain.model.ChannelCatalog
import com.magi.tv.domain.model.ConnectionSettings
import com.magi.tv.domain.model.PlaybackDecision
import com.magi.tv.domain.model.Programme
import com.magi.tv.domain.repository.ConnectionSettingsRepository
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
    suspend operator fun invoke(channelId: String?): List<Programme> {
        val from = clock.nowEpochMs()
        return repository.getProgrammeGuide(
            channelId = channelId
                ?.takeIf { it.isNotBlank() }
                ?.removePrefix("magi:"),
            fromEpochMs = from,
            toEpochMs = from + GUIDE_WINDOW_MS,
        )
    }

    private companion object {
        const val GUIDE_WINDOW_MS = 12 * 60 * 60 * 1000L
    }
}

class SaveConnectionSettingsUseCase(
    private val repository: ConnectionSettingsRepository,
) {
    suspend operator fun invoke(serverUrl: String, apiKey: String) {
        val normalizedUrl = serverUrl.trim().trimEnd('/')
        val normalizedKey = apiKey.trim()
        require(normalizedUrl.startsWith("http://") || normalizedUrl.startsWith("https://")) {
            "服务器地址必须以 http:// 或 https:// 开头"
        }
        require(normalizedKey.isNotBlank()) { "API Key 不能为空" }
        repository.save(
            ConnectionSettings(
                serverUrl = normalizedUrl,
                apiKey = normalizedKey,
            ),
        )
    }
}
