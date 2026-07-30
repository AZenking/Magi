package com.magi.tv.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.lastChannelDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "magi_last_channel",
)

/**
 * Persists the last-watched channel id so the live player can resume it on
 * launch (roadmap §9.2 "开机恢复上次频道"). Kept in its own DataStore so it
 * is independent of connection settings.
 */
class LastChannelStore(context: Context) {
    private val key = stringPreferencesKey("last_channel_id")
    private val store = context.applicationContext.lastChannelDataStore

    val lastChannelId: Flow<String?> = store.data.map { it[key] }

    suspend fun save(channelId: String) {
        store.edit { it[key] = channelId }
    }

    suspend fun clear() {
        store.edit { it.remove(key) }
    }
}
