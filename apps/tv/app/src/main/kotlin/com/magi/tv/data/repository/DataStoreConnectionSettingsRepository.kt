package com.magi.tv.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.magi.tv.domain.model.ConnectionSettings
import com.magi.tv.domain.repository.ConnectionSettingsRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "magi_settings",
)

class DataStoreConnectionSettingsRepository(
    private val context: Context,
) : ConnectionSettingsRepository {
    private val serverUrlKey = stringPreferencesKey("server_url")
    private val apiKey = stringPreferencesKey("api_key")

    override val settings: Flow<ConnectionSettings> =
        context.settingsDataStore.data.map { preferences ->
            ConnectionSettings(
                serverUrl = preferences[serverUrlKey].orEmpty(),
                apiKey = preferences[apiKey].orEmpty(),
            )
        }

    override suspend fun save(settings: ConnectionSettings) {
        context.settingsDataStore.edit { preferences ->
            preferences[serverUrlKey] = settings.serverUrl
            preferences[apiKey] = settings.apiKey
        }
    }
}
