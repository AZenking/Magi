package com.magi.tv.ui.navigation

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

sealed interface TvDestination {
    data object Channels : TvDestination

    data class Guide(
        val channelId: String,
        val channelName: String,
    ) : TvDestination

    data object Diagnostics : TvDestination
}

class TvNavigationViewModel : ViewModel() {
    private val mutableDestination =
        MutableStateFlow<TvDestination>(TvDestination.Channels)
    val destination = mutableDestination.asStateFlow()

    fun openGuide(channelId: String, channelName: String) {
        mutableDestination.value = TvDestination.Guide(
            channelId = channelId,
            channelName = channelName,
        )
    }

    fun openDiagnostics() {
        mutableDestination.value = TvDestination.Diagnostics
    }

    fun navigateBack() {
        mutableDestination.value = TvDestination.Channels
    }
}
