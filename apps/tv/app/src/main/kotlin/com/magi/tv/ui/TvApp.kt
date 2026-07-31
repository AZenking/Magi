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
import com.magi.tv.ui.channels.DiagnosticsScreen
import com.magi.tv.ui.channels.DiagnosticsViewModel
import com.magi.tv.ui.channels.LivePlaybackScreen
import com.magi.tv.ui.channels.LivePlaybackViewModel

/**
 * Presentation composition root (004-safe-operations).
 *
 * Zero-input launch: the app boots straight into the persistent live player.
 * Configuration (serverUrl + OAuth2 credentials) is baked in at compile time,
 * so there is no setup screen — the user opens the app and starts watching.
 */
@Composable
fun TvApp(appContainer: AppContainer) {
    val context = LocalContext.current
    val sessionDependencies = remember { appContainer.createTvSession() }
    val liveViewModel: LivePlaybackViewModel = viewModel(
        key = "live",
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
        onReconfigure = { /* no-op: zero-input, nothing to reconfigure */ },
    )
}
