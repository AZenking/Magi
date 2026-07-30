package com.magi.tv.ui.channels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.magi.tv.domain.model.DiagnosticEvent
import com.magi.tv.domain.repository.DiagnosticsRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn

data class DiagnosticsUiState(
    val events: List<DiagnosticEvent> = emptyList(),
    val lastFirstFrameMs: Long? = null,
)

class DiagnosticsViewModel(
    repository: DiagnosticsRepository,
) : ViewModel() {
    val uiState = combine(
        repository.events,
        repository.lastFirstFrameMs,
    ) { events, firstFrameMs ->
        DiagnosticsUiState(
            events = events,
            lastFirstFrameMs = firstFrameMs,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = DiagnosticsUiState(),
    )

    companion object {
        fun factory(
            repository: DiagnosticsRepository,
        ) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                DiagnosticsViewModel(repository) as T
        }
    }
}
