package com.magi.tv.ui.channels

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.delay

/**
 * The persistent live-playback surface (roadmap §9.5): video is dominant and
 * always-on; D-pad drives everything:
 *   - Up/Down   → switch channels (only when the side sheet is CLOSED; when
 *                 open, Up/Down browse the channel list inside the sheet)
 *   - Left      → toggle the channel+EPG side sheet
 *   - OK/Enter  → toggle the info overlay (which also hosts the diagnostics entry)
 *   - Back      → close sheet → close info → exit app
 *
 * ExoPlayer lives in [LivePlaybackViewModel.session] and is never rebuilt on
 * channel switch (smooth surfing).
 */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@Composable
fun LivePlaybackScreen(
    viewModel: LivePlaybackViewModel,
    onOpenDiagnostics: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val playerState by viewModel.session.state.collectAsStateWithLifecycle()
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    var showInfo by remember { mutableStateOf(false) }
    var showSideSheet by remember { mutableStateOf(false) }
    val playerFocus = remember { FocusRequester() }
    val context = LocalContext.current

    // Grab focus so D-pad lands here first.
    LaunchedEffect(Unit) { playerFocus.requestFocus() }

    // Auto-show info briefly when a channel becomes ready.
    LaunchedEffect(playerState.channelId, playerState.firstFrameMs) {
        if (playerState.firstFrameMs != null && playerState.terminalError == null) {
            showInfo = true
            delay(5_000)
            showInfo = false
        }
    }

    // When the side sheet opens, load the current channel's guide immediately
    // (don't wait for a channel item to gain focus — focus may stay on the player).
    LaunchedEffect(showSideSheet) {
        if (showSideSheet && playerState.channelId.isNotBlank()) {
            viewModel.loadGuide(playerState.channelId)
        }
    }

    // P0 #2: Back key — close sheet → close info → exit app (priority order).
    BackHandler(enabled = showSideSheet || showInfo) {
        when {
            showSideSheet -> showSideSheet = false
            showInfo -> showInfo = false
        }
    }

    androidx.compose.foundation.layout.Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(playerFocus)
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyUp) return@onPreviewKeyEvent false
                when (event.key) {
                    // P0 #1: channel surfing — ONLY when the side sheet is closed.
                    // When the sheet is open, Up/Down must browse the list, not switch.
                    Key.DirectionUp -> {
                        if (showSideSheet) false else { viewModel.switchBy(-1); true }
                    }
                    Key.DirectionDown -> {
                        if (showSideSheet) false else { viewModel.switchBy(1); true }
                    }
                    // Toggle the channel+EPG side sheet.
                    Key.DirectionLeft -> {
                        showSideSheet = !showSideSheet
                        showInfo = false
                        true
                    }
                    // Toggle the info overlay (unless the sheet is open — then OK
                    // selects a channel inside the sheet and isn't consumed here).
                    Key.DirectionCenter, Key.Enter -> {
                        if (showSideSheet) false else { showInfo = !showInfo; true }
                    }
                    else -> false
                }
            }
            .focusable(),
    ) {
        // 1. The persistent video surface.
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = viewModel.session.player()
                    useController = false
                    setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER)
                }
            },
            modifier = Modifier.fillMaxSize(),
        )

        // 2. Loading / error overlays (only when not playing).
        when {
            playerState.terminalError != null -> PlayerErrorOverlay(
                message = playerState.terminalError.orEmpty(),
                modifier = Modifier.align(Alignment.Center),
            )
            uiState.catalogError != null -> PlayerErrorOverlay(
                message = uiState.catalogError.orEmpty(),
                modifier = Modifier.align(Alignment.Center),
            )
            uiState.loading || playerState.firstFrameMs == null || playerState.switching ->
                LoadingOverlay(
                    state = playerState,
                    modifier = Modifier.align(Alignment.Center),
                )
        }

        // 3. Info overlay (toggled by OK). Hosts the diagnostics entry (P0 #3).
        if (showInfo && playerState.firstFrameMs != null && playerState.terminalError == null) {
            androidx.compose.animation.AnimatedVisibility(
                visible = true,
                modifier = Modifier.align(Alignment.BottomCenter),
                enter = androidx.compose.animation.fadeIn(),
                exit = androidx.compose.animation.fadeOut(),
            ) {
                PlayerInfoOverlay(
                    state = playerState,
                    onOpenDiagnostics = {
                        showInfo = false
                        onOpenDiagnostics()
                    },
                )
            }
        }

        // 4. Channel + EPG side sheet (toggled by Left).
        ChannelEpgSideSheet(
            visible = showSideSheet,
            channels = uiState.channels,
            currentChannelId = playerState.channelId,
            guide = uiState.guide,
            guideLoading = uiState.guideLoading,
            onSelectChannel = { channel ->
                viewModel.switchToChannel(channel)
                showSideSheet = false
            },
            onChannelFocused = { channel -> viewModel.loadGuide(channel.id) },
            modifier = Modifier.fillMaxSize(),
        )
    }
}
