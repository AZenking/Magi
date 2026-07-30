package com.magi.tv.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.magi.tv.domain.usecase.SaveConnectionSettingsUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SetupUiState(
    val serverUrl: String = "",
    val apiKey: String = "",
    val saving: Boolean = false,
    val errorMessage: String? = null,
) {
    val canSave: Boolean
        get() = serverUrl.isNotBlank() && apiKey.isNotBlank() && !saving
}

sealed interface SetupAction {
    data class ChangeServerUrl(val value: String) : SetupAction
    data class ChangeApiKey(val value: String) : SetupAction
    data object Save : SetupAction
}

class SetupViewModel(
    private val saveConnectionSettings: SaveConnectionSettingsUseCase,
) : ViewModel() {
    private val mutableUiState = MutableStateFlow(SetupUiState())
    val uiState = mutableUiState.asStateFlow()

    fun onAction(action: SetupAction) {
        when (action) {
            is SetupAction.ChangeServerUrl -> {
                mutableUiState.value = mutableUiState.value.copy(
                    serverUrl = action.value,
                    errorMessage = null,
                )
            }

            is SetupAction.ChangeApiKey -> {
                mutableUiState.value = mutableUiState.value.copy(
                    apiKey = action.value,
                    errorMessage = null,
                )
            }

            SetupAction.Save -> save()
        }
    }

    private fun save() {
        val state = mutableUiState.value
        if (!state.canSave) return

        viewModelScope.launch {
            mutableUiState.value = state.copy(saving = true, errorMessage = null)
            try {
                saveConnectionSettings(state.serverUrl, state.apiKey)
            } catch (error: Exception) {
                mutableUiState.value = mutableUiState.value.copy(
                    saving = false,
                    errorMessage = error.message ?: "保存失败",
                )
            }
        }
    }

    companion object {
        fun factory(
            saveConnectionSettings: SaveConnectionSettingsUseCase,
        ) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                SetupViewModel(saveConnectionSettings) as T
        }
    }
}
