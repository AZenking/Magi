package com.magi.tv.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.util.UnstableApi
import com.magi.tv.di.AppContainer
import com.magi.tv.ui.auth.ClientAuthorizationScreen
import com.magi.tv.ui.auth.ClientAuthorizationViewModel
import com.magi.tv.ui.channels.DiagnosticsScreen
import com.magi.tv.ui.channels.DiagnosticsViewModel
import com.magi.tv.ui.channels.LivePlaybackScreen
import com.magi.tv.ui.channels.LivePlaybackViewModel

/**
 * Presentation composition root (004-safe-operations).
 *
 * A fresh install automatically registers to the configured default account.
 * Once the rotating refresh credential is present, the app enters the
 * persistent live player.
 */
@UnstableApi
@Composable
fun TvApp(appContainer: AppContainer) {
    val context = LocalContext.current
    var hasCredentials by remember { mutableStateOf<Boolean?>(null) }
    val credentials by appContainer.tokenManager.credentials.collectAsStateWithLifecycle()
    LaunchedEffect(appContainer) {
        hasCredentials = appContainer.tokenManager.hasCredentials()
    }
    LaunchedEffect(credentials) {
        if (hasCredentials == true && credentials == null) hasCredentials = false
    }

    if (hasCredentials == null) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MagiTvPalette.Background),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(color = MagiTvPalette.Primary)
        }
        return
    }

    if (hasCredentials == false) {
        val authorizationViewModel: ClientAuthorizationViewModel = viewModel(
            key = "client-authorization",
            factory = ClientAuthorizationViewModel.factory(appContainer.clientSessionRepository),
        )
        ClientAuthorizationScreen(
            viewModel = authorizationViewModel,
            onAuthorized = {
                hasCredentials = true
                appContainer.heartbeatCoordinator.wake()
            },
        )
        return
    }

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
            contentSyncRepository = sessionDependencies.contentSyncRepository,
            clientSessionRepository = appContainer.clientSessionRepository,
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
