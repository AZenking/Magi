package com.magi.tv.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.channelPreferencesDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "magi_channel_preferences",
)

/**
 * Local, device-scoped channel preferences.
 *
 * The control plane remains authoritative for the channel directory. This store
 * only remembers how the viewer wants to reach those channels: favourites and
 * a bounded recent-watch list, similar to the quick-access affordances expected
 * from a TV-first IPTV player.
 */
class ChannelPreferencesStore(context: Context) {
    private val store = context.applicationContext.channelPreferencesDataStore

    val favoriteChannelIds: Flow<Set<String>> = store.data.map { preferences ->
        preferences[FAVORITES_KEY].orEmpty()
    }

    val recentChannelIds: Flow<List<String>> = store.data.map { preferences ->
        parseRecent(preferences[RECENT_CHANNEL_IDS_KEY])
    }

    /** Toggles a favourite and returns its state after the update. */
    suspend fun toggleFavorite(channelId: String): Boolean {
        var isFavorite = false
        store.edit { preferences ->
            val next = preferences[FAVORITES_KEY].orEmpty().toMutableSet()
            isFavorite = if (next.remove(channelId)) {
                false
            } else {
                next.add(channelId)
                true
            }
            preferences[FAVORITES_KEY] = next
        }
        return isFavorite
    }

    /** Records a successfully resolved channel at the head of the recent list. */
    suspend fun recordViewed(channelId: String) {
        store.edit { preferences ->
            val next = buildList {
                add(channelId)
                addAll(parseRecent(preferences[RECENT_CHANNEL_IDS_KEY]).filter { it != channelId })
            }.take(MAX_RECENT_CHANNELS)
            preferences[RECENT_CHANNEL_IDS_KEY] = next.joinToString(RECENT_SEPARATOR)
        }
    }

    private fun parseRecent(serialized: String?): List<String> = serialized
        ?.split(RECENT_SEPARATOR)
        ?.filter { it.isNotBlank() }
        .orEmpty()

    private companion object {
        val FAVORITES_KEY = stringSetPreferencesKey("favorite_channel_ids")
        val RECENT_CHANNEL_IDS_KEY = stringPreferencesKey("recent_channel_ids")
        const val RECENT_SEPARATOR = "\u001F"
        const val MAX_RECENT_CHANNELS = 20
    }
}
