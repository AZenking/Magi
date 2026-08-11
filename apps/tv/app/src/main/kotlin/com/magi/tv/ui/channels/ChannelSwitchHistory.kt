package com.magi.tv.ui.channels

import com.magi.tv.domain.model.Channel

/**
 * Session-only "previous channel" state for the player surface.
 *
 * This intentionally is not persisted: the durable last-channel preference is
 * for app resume, while Left on the player should toggle only the viewer's
 * current in-session transition.
 */
internal class ChannelSwitchHistory {
    private var previousChannelId: String? = null

    fun recordLeaving(channelId: String) {
        if (channelId.isNotBlank()) previousChannelId = channelId
    }

    fun previousIn(channels: List<Channel>, currentChannelId: String): Channel? {
        val targetId = previousChannelId ?: return null
        if (targetId == currentChannelId) return null
        return channels.firstOrNull { it.id == targetId }
    }
}
