package com.magi.tv.ui.client

import androidx.annotation.VisibleForTesting
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.magi.tv.domain.model.DeviceAuthorizationChallenge
import com.magi.tv.domain.repository.ClientSessionRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class ClientAuthorizationPhase { Loading, AwaitingUser, Authorized, Failed }

data class ClientAuthorizationUiState(
    val phase: ClientAuthorizationPhase = ClientAuthorizationPhase.Loading,
    val challenge: DeviceAuthorizationChallenge? = null,
    val message: String? = null,
    val retryInSeconds: Int? = null,
)

class ClientAuthorizationViewModel(
    private val repository: ClientSessionRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(ClientAuthorizationUiState())
    val uiState = mutableState.asStateFlow()

    /** Test hook: drive the UI state without coroutine timing. */
    @VisibleForTesting
    fun setStateForTest(state: ClientAuthorizationUiState) {
        mutableState.value = state
    }
    private var authorizationJob: Job? = null

    fun start() {
        if (authorizationJob?.isActive == true) return
        authorizationJob = viewModelScope.launch { authorizeAndPoll() }
    }

    fun retry() {
        authorizationJob?.cancel()
        authorizationJob = null
        mutableState.value = ClientAuthorizationUiState()
        start()
    }

    private suspend fun authorizeAndPoll() {
        try {
            repository.registerDefaultDevice()
            mutableState.value = ClientAuthorizationUiState(
                phase = ClientAuthorizationPhase.Authorized,
                message = "设备已自动注册",
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            mutableState.value = ClientAuthorizationUiState(
                phase = ClientAuthorizationPhase.Failed,
                message = error.message ?: "设备自动注册失败",
            )
        }
    }

    companion object {
        fun factory(repository: ClientSessionRepository) =
            object : androidx.lifecycle.ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    ClientAuthorizationViewModel(repository) as T
            }
    }
}
