package com.magi.tv.ui.channels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.magi.tv.domain.model.Programme
import com.magi.tv.domain.usecase.GetProgrammeGuideUseCase
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class EpgUiState(
    val loading: Boolean = true,
    val programmes: List<Programme> = emptyList(),
    val errorMessage: String? = null,
)

class EpgViewModel(
    private val getProgrammeGuide: GetProgrammeGuideUseCase,
) : ViewModel() {
    private val mutableUiState = MutableStateFlow(EpgUiState())
    val uiState = mutableUiState.asStateFlow()

    private var loadedChannelId: String? = null

    fun load(channelId: String?, force: Boolean = false) {
        val normalizedChannelId = channelId?.takeIf { it.isNotBlank() }
        if (!force && loadedChannelId == normalizedChannelId && !mutableUiState.value.loading) {
            return
        }
        loadedChannelId = normalizedChannelId
        mutableUiState.value = mutableUiState.value.copy(
            loading = true,
            errorMessage = null,
        )
        viewModelScope.launch {
            try {
                mutableUiState.value = EpgUiState(
                    loading = false,
                    programmes = getProgrammeGuide(normalizedChannelId),
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                mutableUiState.value = EpgUiState(
                    loading = false,
                    errorMessage = error.message ?: "节目单加载失败",
                )
            }
        }
    }

    companion object {
        fun factory(
            getProgrammeGuide: GetProgrammeGuideUseCase,
        ) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                EpgViewModel(
                    getProgrammeGuide = getProgrammeGuide,
                ) as T
        }
    }
}
