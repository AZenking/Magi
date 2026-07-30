package com.magi.tv.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.magi.tv.di.AppContainer
import com.magi.tv.domain.model.ConnectionSettings
import com.magi.tv.ui.channels.DiagnosticsScreen
import com.magi.tv.ui.channels.DiagnosticsViewModel
import com.magi.tv.ui.channels.LivePlaybackScreen
import com.magi.tv.ui.channels.LivePlaybackViewModel
import com.magi.tv.ui.settings.SetupScreen
import com.magi.tv.ui.settings.SetupViewModel

/**
 * Presentation composition root.
 *
 * Until configured, the setup screen is shown. Once configured, the app boots
 * straight into the persistent live player (roadmap §9.2 "开机恢复上次频道").
 */
@Composable
fun TvApp(appContainer: AppContainer) {
    val settings by appContainer.settingsRepository.settings
        .collectAsStateWithLifecycle(initialValue = ConnectionSettings())

    if (!settings.isConfigured) {
        val setupViewModel: SetupViewModel = viewModel(
            factory = SetupViewModel.factory(appContainer.saveConnectionSettings),
        )
        val setupState by setupViewModel.uiState.collectAsStateWithLifecycle()
        SetupScreen(state = setupState, onAction = setupViewModel::onAction)
        return
    }

    val context = LocalContext.current
    val sessionDependencies = remember(settings.serverUrl, settings.apiKey) {
        appContainer.createTvSession(settings)
    }
    val liveViewModel: LivePlaybackViewModel = viewModel(
        key = "live-${settings.serverUrl}-${settings.apiKey.hashCode()}",
        factory = LivePlaybackViewModel.factory(
            context = context.applicationContext,
            getChannelCatalog = sessionDependencies.getChannelCatalog,
            resolvePlayback = sessionDependencies.resolvePlayback,
            getProgrammeGuide = sessionDependencies.getProgrammeGuide,
            lastChannelStore = appContainer.lastChannelStore,
            diagnosticsRepository = appContainer.diagnosticsRepository,
        ),
    )

    var showDiagnostics by remember { mutableStateOf(false) }
    if (showDiagnostics) {
        val diagnosticsViewModel: DiagnosticsViewModel = viewModel(
            factory = DiagnosticsViewModel.factory(appContainer.diagnosticsRepository),
        )
        val diagnosticsState by diagnosticsViewModel.uiState.collectAsStateWithLifecycle()
        androidx.activity.compose.BackHandler { showDiagnostics = false }
        DiagnosticsScreen(state = diagnosticsState)
        return
    }

    LivePlaybackScreen(
        viewModel = liveViewModel,
        onOpenDiagnostics = { showDiagnostics = true },
    )
}
