package com.magi.tv.data.repository

import com.magi.tv.data.remote.HeartbeatResponseDto
import kotlin.test.Test
import kotlin.test.assertEquals

class DefaultClientSessionRepositoryTest {
    @Test
    fun `heartbeat DTO keeps server timestamps and cadence fields`() {
        val dto = HeartbeatResponseDto(
            serverTime = "2026-07-31T00:00:00Z",
            lastActiveAt = "2026-07-31T00:00:00Z",
            nextHeartbeatInSeconds = 60,
            onlineWindowSeconds = 150,
        )
        assertEquals(60, dto.nextHeartbeatInSeconds)
        assertEquals(150, dto.onlineWindowSeconds)
    }
}
