package com.magi.tv.data.auth

import com.magi.tv.domain.model.DeviceCredentials
import com.magi.tv.domain.repository.ClientCredentialStore
import kotlinx.coroutines.test.runTest
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.fail

class TokenManagerTest {
    private class FakeStore(
        initial: DeviceCredentials? = null,
    ) : ClientCredentialStore {
        var stored: DeviceCredentials? = initial
            private set
        var cleared = false
            private set

        override suspend fun getOrCreateInstallationId() = "installation-1"
        override suspend fun read() = stored
        override suspend fun write(credentials: DeviceCredentials) { stored = credentials }
        override suspend fun clear() {
            stored = null
            cleared = true
        }
    }

    @Test
    fun `saving a device token persists only rotating credential metadata`() = runTest {
        val store = FakeStore()
        val manager = TokenManager(store)

        manager.saveDeviceToken(
            TokenResponse(
                accessToken = "tok_access",
                expiresIn = 3600,
                scope = "open:read client:heartbeat",
                refreshToken = "rft_refresh",
                deviceClientId = "device-1",
            ),
        )

        assertEquals("device-1", store.stored?.deviceClientId)
        assertEquals("rft_refresh", store.stored?.refreshToken)
        assertEquals(1, store.stored?.generation)
    }

    @Test
    fun `saving a token reuses the existing family id and increments the generation`() = runTest {
        val store = FakeStore(
            DeviceCredentials(deviceClientId = "device-1", refreshToken = "old-rt", familyId = "family-x", generation = 3),
        )
        val manager = TokenManager(store)

        manager.saveDeviceToken(
            TokenResponse(
                accessToken = "tok_access",
                expiresIn = 3600,
                refreshToken = "new-rt",
                deviceClientId = "device-1",
            ),
        )

        assertEquals("family-x", store.stored?.familyId)
        assertEquals(4, store.stored?.generation)
        assertEquals("new-rt", store.stored?.refreshToken)
    }

    @Test
    fun `saving a token without a refresh token is rejected`() = runTest {
        val store = FakeStore()
        val manager = TokenManager(store)

        try {
            manager.saveDeviceToken(
                TokenResponse(accessToken = "tok", expiresIn = 3600, refreshToken = null, deviceClientId = "device-1"),
            )
            fail("expected TokenException")
        } catch (e: TokenException) {
            assertEquals("invalid_response", e.code)
        }
        // Nothing should have been persisted.
        assertNull(store.stored)
    }

    @Test
    fun `hasCredentials reflects the store contents`() = runTest {
        val store = FakeStore(
            DeviceCredentials(deviceClientId = "device-1", refreshToken = "rt", familyId = "f", generation = 1),
        )
        val manager = TokenManager(store)

        assertTrue(manager.hasCredentials())
    }

    @Test
    fun `hasCredentials returns false when nothing is stored`() = runTest {
        val store = FakeStore()
        val manager = TokenManager(store)

        assertFalse(manager.hasCredentials())
    }

    @Test
    fun `clearCredentials removes the persisted credentials`() = runTest {
        val store = FakeStore(
            DeviceCredentials(deviceClientId = "device-1", refreshToken = "rt", familyId = "f", generation = 1),
        )
        val manager = TokenManager(store)

        manager.clearCredentials()

        assertNull(store.stored)
        assertTrue(store.cleared)
        // The credentials StateFlow must drop to null after clearing.
        assertNull(manager.credentials.value)
    }

    @Test
    fun `credentials StateFlow updates after saving a device token`() = runTest {
        val store = FakeStore()
        val manager = TokenManager(store)

        assertNull(manager.credentials.value)

        manager.saveDeviceToken(
            TokenResponse(
                accessToken = "tok_access", expiresIn = 3600,
                refreshToken = "rft_refresh", deviceClientId = "device-1",
            ),
        )

        assertEquals("device-1", manager.credentials.value?.deviceClientId)
        assertEquals("rft_refresh", manager.credentials.value?.refreshToken)
    }
}
