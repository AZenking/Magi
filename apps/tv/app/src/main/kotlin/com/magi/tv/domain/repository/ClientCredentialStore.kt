package com.magi.tv.domain.repository

import com.magi.tv.domain.model.DeviceCredentials

interface ClientCredentialStore {
    /** Stable per-install identity used by automatic device registration. */
    suspend fun getOrCreateInstallationId(): String
    suspend fun read(): DeviceCredentials?
    suspend fun write(credentials: DeviceCredentials)
    suspend fun clear()
}
