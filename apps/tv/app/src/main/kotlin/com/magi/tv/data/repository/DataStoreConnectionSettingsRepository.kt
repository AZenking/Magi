package com.magi.tv.data.repository

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.magi.tv.domain.model.ConnectionSettings
import com.magi.tv.domain.repository.ConnectionSettingsRepository
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.onStart

private const val PREFS_NAME = "magi_credentials"
private const val KEY_SERVER_URL = "server_url"
private const val KEY_API_KEY = "api_key"

/**
 * Stores the server URL + API key in [EncryptedSharedPreferences] (backed by the
 * Android Keystore), not plain preferences — constitution VIII "凭据保护" requires
 * encrypted credential storage. Exposes the same Flow + suspend save contract as
 * the domain interface, so callers are unchanged.
 */
class DataStoreConnectionSettingsRepository(
    private val context: Context,
) : ConnectionSettingsRepository {

    // EncryptedSharedPreferences creation is relatively heavy; create once.
    private val encryptedPrefs: SharedPreferences by lazy { createEncryptedPrefs(context) }

    private fun readSettings(): ConnectionSettings = ConnectionSettings(
        serverUrl = encryptedPrefs.getString(KEY_SERVER_URL, "").orEmpty(),
        apiKey = encryptedPrefs.getString(KEY_API_KEY, "").orEmpty(),
    )

    override val settings: Flow<ConnectionSettings> = callbackFlow {
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
            if (key == KEY_SERVER_URL || key == KEY_API_KEY || key == null) {
                trySend(readSettings())
            }
        }
        encryptedPrefs.registerOnSharedPreferenceChangeListener(listener)
        awaitClose { encryptedPrefs.unregisterOnSharedPreferenceChangeListener(listener) }
    }.onStart { emit(readSettings()) }

    override suspend fun save(settings: ConnectionSettings) {
        encryptedPrefs.edit()
            .putString(KEY_SERVER_URL, settings.serverUrl)
            .putString(KEY_API_KEY, settings.apiKey)
            .apply()
    }

    private fun createEncryptedPrefs(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            context.applicationContext,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }
}
