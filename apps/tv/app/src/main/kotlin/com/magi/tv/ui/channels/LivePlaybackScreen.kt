package com.magi.tv.ui.channels

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.unit.dp
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
    onReconfigure: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val playerState by viewModel.session.state.collectAsStateWithLifecycle()
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val stats by viewModel.session.stats.collectAsStateWithLifecycle()

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
            viewModel.onChannelFocused(playerState.channelId)
        }
    }

    // pendingTune: close the side sheet only when the EXACT tuned channel
    // reaches its first frame. Both ids are "magi:xxx" (from the open API),
    // so compare directly — no prefix stripping.
    LaunchedEffect(playerState.channelId, playerState.firstFrameMs, uiState.pendingTuneChannelId) {
        val pending = uiState.pendingTuneChannelId
        if (pending != null &&
            playerState.channelId == pending &&
            playerState.firstFrameMs != null &&
            playerState.terminalError == null
        ) {
            viewModel.onTuneSucceeded()
            showSideSheet = false
        }
    }

    // Poll derived stats (buffer health + state) for the always-on HUD.
    // Event-driven fields arrive via the AnalyticsListener; this only refreshes
    // the values that must be read live from the player.
    LaunchedEffect(Unit) {
        while (true) {
            viewModel.session.refreshDerivedStats()
            delay(500)
        }
    }

    // Back key — close sheet → close info → exit. When closing the sheet,
    // explicitly restore focus to the player (constitution VIII: deterministic focus).
    BackHandler(enabled = showSideSheet || showInfo) {
        when {
            showSideSheet -> {
                showSideSheet = false
                runCatching { playerFocus.requestFocus() }
            }
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
                    // Toggle the side sheet ONLY when closed. When open, Left
                    // must fall through to the sheet (programme area uses Left
                    // to return to the channel column — P0 fix).
                    Key.DirectionLeft -> {
                        if (showSideSheet) false else {
                            showSideSheet = true
                            showInfo = false
                            true
                        }
                    }
                    // OK/Enter: when the side sheet is open, tune to the focused
                    // channel (the parent onPreviewKeyEvent can't reliably route
                    // OK to the LazyColumn item inside AnimatedVisibility, so we
                    // drive it from here using focusedChannelId). When the sheet
                    // is closed, toggle the info overlay.
                    Key.DirectionCenter, Key.Enter -> {
                        when {
                            showSideSheet -> { viewModel.tuneFocusedChannel(); true }
                            showInfo -> false // fall through to overlay buttons
                            else -> { showInfo = true; true }
                        }
                    }
                    else -> false
                }
            }
            .focusable(),
    ) {
        // 1. The persistent video surface.
        // CRITICAL: The PlayerView is created ONCE via remember { } and reused
        // across recompositions. This prevents Compose from spawning multiple
        // PlayerView instances (each attaching its own surface to the same
        // ExoPlayer → double/triple video layers). The player is attached in
        // a DisposableEffect (not in factory) so it survives recomposition.
        val playerView = remember {
            android.widget.FrameLayout(context).let { frame ->
                PlayerView(frame.context).apply {
                    useController = false
                    setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER)
                    // Player attached via DisposableEffect below, not here.
                }
            }
        }
        val playerInstance = viewModel.session.player()
        androidx.compose.runtime.DisposableEffect(playerInstance) {
            playerView.player = playerInstance
            onDispose { playerView.player = null }
        }
        AndroidView(
            factory = { playerView },
            modifier = Modifier.fillMaxSize(),
        )

        // 2. Loading / error overlays (only when not playing).
        val terminalErr = playerState.terminalError
        when {
            terminalErr != null -> PlayerErrorOverlay(
                message = terminalErr,
                modifier = Modifier.align(Alignment.Center),
            )
            uiState.catalogError != null -> PlayerErrorOverlay(
                message = uiState.catalogError!!.message,
                modifier = Modifier.align(Alignment.Center),
            )
            uiState.loading || playerState.firstFrameMs == null || playerState.switching || playerState.buffering ->
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
            channels = viewModel.displayedChannelList(),
            groups = uiState.groups,
            selectedGroup = uiState.selectedGroup,
            currentChannelId = playerState.channelId,
            currentChannelName = playerState.channelName,
            guide = uiState.guide,
            guideLoading = uiState.guideLoading,
            guideError = uiState.guideError,
            guideStale = uiState.guideStale,
            tuneError = uiState.tuneError,
            selectedDate = uiState.selectedDate,
            onSelectGroup = { viewModel.selectGroup(it) },
            onSelectDate = { viewModel.selectDate(it) },
            onSelectChannel = { channel -> viewModel.requestTune(channel) },
            onPlayCurrent = { viewModel.tuneCurrent() },
            onChannelFocused = { channel -> viewModel.onChannelFocused(channel.id) },
            onReconfigure = onReconfigure,
            modifier = Modifier.fillMaxSize(),
        )

        // 5. Always-on "Stats for nerds" HUD (top-right, YouTube-style debug).
        PlaybackStatsHud(
            stats = stats,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(16.dp),
        )
    }
}
