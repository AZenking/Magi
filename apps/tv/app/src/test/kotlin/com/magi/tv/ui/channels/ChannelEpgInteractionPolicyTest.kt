package com.magi.tv.ui.channels

import com.magi.tv.domain.model.Channel
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ChannelEpgInteractionPolicyTest {
    private val news = channel("news")
    private val sports = channel("sports")
    private val movies = channel("movies")

    @Test
    fun `EPG initial focus keeps the playing channel when it is visible`() {
        assertEquals("sports", initialEpgFocusChannelId(listOf(news, sports, movies), "sports"))
    }

    @Test
    fun `EPG initial focus falls back to first filtered channel`() {
        assertEquals("news", initialEpgFocusChannelId(listOf(news, movies), "sports"))
    }

    @Test
    fun `EPG empty filter has no channel focus target`() {
        assertNull(initialEpgFocusChannelId(emptyList(), "sports"))
    }

    @Test
    fun `selecting current EPG channel closes instead of re-tuning`() {
        assertTrue(shouldCloseEpgForSelectedChannel("sports", "sports", currentChannelPlayable = true))
        assertFalse(shouldCloseEpgForSelectedChannel("news", "sports", currentChannelPlayable = true))
        assertFalse(shouldCloseEpgForSelectedChannel("sports", "sports", currentChannelPlayable = false))
    }

    @Test
    fun `previous channel history toggles between the last two channels`() {
        val history = ChannelSwitchHistory()
        val channels = listOf(news, sports, movies)

        history.recordLeaving(news.id) // news → sports
        assertEquals(news, history.previousIn(channels, sports.id))

        history.recordLeaving(sports.id) // sports → news
        assertEquals(sports, history.previousIn(channels, news.id))
    }

    private fun channel(id: String) = Channel(
        id = id,
        name = id,
        group = null,
        logo = null,
        channelNumber = null,
    )
}
