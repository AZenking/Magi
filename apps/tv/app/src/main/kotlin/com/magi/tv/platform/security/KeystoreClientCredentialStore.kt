package com.magi.tv.platform.security

import android.content.Context
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.magi.tv.domain.model.DeviceCredentials
import com.magi.tv.domain.repository.ClientCredentialStore
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

private val Context.clientCredentialsDataStore by preferencesDataStore(name = "client_credentials")

@Serializable
private data class StoredCredentials(
    val deviceClientId: String,
    val refreshToken: String,
    val familyId: String,
    val generation: Int,
)

class KeystoreClientCredentialStore(private val context: Context) : ClientCredentialStore {
    private val appContext = context.applicationContext
    private val json = Json { ignoreUnknownKeys = false }

    override suspend fun getOrCreateInstallationId(): String {
        val existing = appContext.clientCredentialsDataStore.data.first()[INSTALLATION_ID]
        if (existing != null) return existing
        val generated = UUID.randomUUID().toString()
        appContext.clientCredentialsDataStore.edit { prefs ->
            if (prefs[INSTALLATION_ID] == null) prefs[INSTALLATION_ID] = generated
        }
        return appContext.clientCredentialsDataStore.data.first()[INSTALLATION_ID] ?: generated
    }

    override suspend fun read(): DeviceCredentials? {
        return try {
            val prefs = appContext.clientCredentialsDataStore.data.first()
            val version = prefs[SCHEMA_VERSION] ?: return null
            val iv = prefs[IV] ?: return null
            val ciphertext = prefs[CIPHERTEXT] ?: return null
            if (version != SCHEMA_VERSION_VALUE) return null
            val payload = decrypt(iv, ciphertext)
            val stored = json.decodeFromString<StoredCredentials>(payload)
            DeviceCredentials(stored.deviceClientId, stored.refreshToken, stored.familyId, stored.generation)
        } catch (_: Exception) {
            clear()
            null
        }
    }

    override suspend fun write(credentials: DeviceCredentials) {
        val payload = json.encodeToString(
            StoredCredentials.serializer(),
            StoredCredentials(credentials.deviceClientId, credentials.refreshToken, credentials.familyId, credentials.generation),
        )
        val (iv, ciphertext) = encrypt(payload)
        appContext.clientCredentialsDataStore.edit { prefs ->
            prefs[SCHEMA_VERSION] = SCHEMA_VERSION_VALUE
            prefs[IV] = iv
            prefs[CIPHERTEXT] = ciphertext
        }
    }

    override suspend fun clear() {
        // Keep the installation id stable across re-registration. Clearing it
        // would create duplicate rows after a transient credential failure.
        appContext.clientCredentialsDataStore.edit { prefs ->
            prefs.remove(SCHEMA_VERSION)
            prefs.remove(IV)
            prefs.remove(CIPHERTEXT)
        }
    }

    private fun encrypt(value: String): Pair<String, String> {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        return encode(cipher.iv) to encode(cipher.doFinal(value.toByteArray(Charsets.UTF_8)))
    }

    private fun decrypt(iv: String, ciphertext: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_LENGTH_BITS, Base64.decode(iv, Base64.NO_WRAP)))
        return cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP)).toString(Charsets.UTF_8)
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existing = keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
        if (existing != null) return existing.secretKey
        return KeyGenerator.getInstance("AES", ANDROID_KEYSTORE).apply {
            init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build(),
            )
        }.generateKey()
    }

    private fun encode(value: ByteArray): String = Base64.encodeToString(value, Base64.NO_WRAP)

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "magi.client.credentials"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val TAG_LENGTH_BITS = 128
        private const val SCHEMA_VERSION_VALUE = 1
        private val SCHEMA_VERSION = intPreferencesKey("schema_version")
        private val INSTALLATION_ID = stringPreferencesKey("installation_id")
        private val IV = stringPreferencesKey("iv")
        private val CIPHERTEXT = stringPreferencesKey("ciphertext")
    }
}
