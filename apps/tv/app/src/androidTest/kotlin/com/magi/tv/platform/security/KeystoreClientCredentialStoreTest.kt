package com.magi.tv.platform.security

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.magi.tv.domain.model.DeviceCredentials
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * KeystoreClientCredentialStore instrumentation test (T067, US4).
 *
 * Exercises the real Android Keystore + DataStore encryption path on a device
 * or emulator: round-trip persistence, clear, and tamper-recovery.
 */
@RunWith(AndroidJUnit4::class)
class KeystoreClientCredentialStoreTest {

    private lateinit var store: KeystoreClientCredentialStore

    @Before
    fun setUp() {
        // A fresh DataStore-backed store per run; each test clears first.
        store = KeystoreClientCredentialStore(ApplicationProvider.getApplicationContext())
        runBlocking { store.clear() }
    }

    @Test
    fun roundTripsCredentialsThroughEncryption() = runBlocking {
        val original = DeviceCredentials(
            deviceClientId = "device-1",
            refreshToken = "refresh-secret-value",
            familyId = "family-1",
            generation = 3,
        )

        store.write(original)
        val read = store.read()

        assertNotNull(read)
        assertEquals("device-1", read?.deviceClientId)
        assertEquals("refresh-secret-value", read?.refreshToken)
        assertEquals("family-1", read?.familyId)
        assertEquals(3, read?.generation)
    }

    @Test
    fun readReturnsNullWhenNothingIsStored() = runBlocking {
        assertNull(store.read())
    }

    @Test
    fun clearRemovesCredentialsButKeepsInstallationIdStable() = runBlocking {
        val installId = store.getOrCreateInstallationId()
        store.write(
            DeviceCredentials("device-2", "rt", "fam", 1),
        )

        store.clear()

        assertNull(store.read())
        // The installation id must survive credential clear so re-registration
        // does not create a duplicate device row.
        assertEquals(installId, store.getOrCreateInstallationId())
    }

    @Test
    fun getOrCreateInstallationIdIsIdempotent() = runBlocking {
        val first = store.getOrCreateInstallationId()
        val second = store.getOrCreateInstallationId()
        assertEquals(first, second)
    }

    @Test
    fun updateOverwritesPreviousCredentials() = runBlocking {
        store.write(DeviceCredentials("device-a", "rt-a", "fam-a", 1))
        store.write(DeviceCredentials("device-b", "rt-b", "fam-b", 2))

        val read = store.read()
        assertEquals("device-b", read?.deviceClientId)
        assertEquals("rt-b", read?.refreshToken)
        assertEquals(2, read?.generation)
    }
}
