package com.magi.tv.data.auth

import com.magi.tv.domain.model.DeviceCredentials
import com.magi.tv.domain.repository.ClientCredentialStore
import kotlinx.coroutines.test.runTest
import org.junit.Test
import kotlin.test.assertEquals

class TokenManagerTest {
    @Test
    fun `saving a device token persists only rotating credential metadata`() = runTest {
        var stored: DeviceCredentials? = null
        val manager = TokenManager(object : ClientCredentialStore {
            override suspend fun getOrCreateInstallationId() = "installation-1"
            override suspend fun read() = stored
            override suspend fun write(credentials: DeviceCredentials) { stored = credentials }
            override suspend fun clear() { stored = null }
        })

        manager.saveDeviceToken(
            TokenResponse(
                accessToken = "tok_access",
                expiresIn = 3600,
                scope = "open:read client:heartbeat",
                refreshToken = "rft_refresh",
                deviceClientId = "device-1",
            ),
        )

        assertEquals("device-1", stored?.deviceClientId)
        assertEquals("rft_refresh", stored?.refreshToken)
        assertEquals(1, stored?.generation)
    }
}
