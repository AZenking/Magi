package com.magi.tv.data.repository

import com.magi.tv.domain.model.DiagnosticEvent
import com.magi.tv.domain.repository.DiagnosticsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class InMemoryDiagnosticsRepository : DiagnosticsRepository {
    private val mutableEvents = MutableStateFlow<List<DiagnosticEvent>>(emptyList())
    override val events = mutableEvents.asStateFlow()

    private val mutableLastFirstFrameMs = MutableStateFlow<Long?>(null)
    override val lastFirstFrameMs = mutableLastFirstFrameMs.asStateFlow()

    override fun recordEvent(event: DiagnosticEvent) {
        mutableEvents.value = (mutableEvents.value + event).takeLast(MAX_EVENTS)
    }

    override fun recordFirstFrame(durationMs: Long) {
        mutableLastFirstFrameMs.value = durationMs
    }

    private companion object {
        const val MAX_EVENTS = 50
    }
}
