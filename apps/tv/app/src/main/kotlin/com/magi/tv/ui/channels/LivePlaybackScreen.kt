package com.magi.tv.ui.channels

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

    var showInfo by remember { mutableStateOf(false) }
    var showSideSheet by remember { mutableStateOf(false) }
    var infoActionFocused by remember { mutableStateOf(false) }
    var errorActionFocused by remember { mutableStateOf(false) }
    val playerFocus = remember { FocusRequester() }
    val context = LocalContext.current

    // Auto-show info briefly when a channel becomes ready.
    LaunchedEffect(playerState.channelId, playerState.firstFrameMs) {
        if (playerState.firstFrameMs != null && playerState.terminalError == null) {
            showInfo = true
            delay(5_000)
            showInfo = false
        }
    }

    // When the EPG overlay opens, focus is handed to its current row/programme
    // after the full-screen grid has entered composition.
    LaunchedEffect(showSideSheet) {
        if (showSideSheet && playerState.channelId.isNotBlank()) {
            viewModel.onChannelFocused(playerState.channelId)
        } else if (!showSideSheet) {
            // The player root is re-enabled when the drawer closes. Give the
            // focus system a few frames to attach it before requesting focus;
            // this also covers a successful tune that closes the drawer.
            repeat(4) {
                kotlinx.coroutines.delay(50)
                if (playerFocus.requestFocus()) return@LaunchedEffect
            }
        }
    }

    LaunchedEffect(showInfo) {
        if (!showInfo) infoActionFocused = false
    }

    LaunchedEffect(playerState.terminalError, uiState.catalogError) {
        errorActionFocused = false
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

    // Diagnostics remains event-ready even though its technical HUD is no
    // longer permanently painted over the programme guide.
    LaunchedEffect(Unit) {
        while (true) {
            viewModel.session.refreshDerivedStats()
            delay(1_000)
        }
    }

    val terminalError = playerState.terminalError
    val catalogError = uiState.catalogError
    val hasPlaybackError = terminalError != null || catalogError != null

    // Back key — close sheet → close info → exit. The focus request is handled
    // by the showSideSheet effect above so every close path behaves the same.
    BackHandler(enabled = showSideSheet || showInfo) {
        when {
            showSideSheet -> {
                showSideSheet = false
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
                    // OK/Enter is owned by whichever surface currently has focus:
                    // drawer rows/chips, the diagnostics action, or the error
                    // recovery action. Only the player root toggles the info
                    // overlay here.
                    Key.DirectionCenter, Key.Enter -> {
                        when {
                            // The drawer owns OK. Its focused row/chip/button
                            // receives the event and performs its own action.
                            showSideSheet -> false
                            showInfo && infoActionFocused -> false
                            showInfo -> { showInfo = false; true }
                            hasPlaybackError && errorActionFocused -> false
                            hasPlaybackError -> {
                                showSideSheet = true
                                showInfo = false
                                true
                            }
                            else -> { showInfo = true; true }
                        }
                    }
                    else -> false
                }
            }
            // While the drawer is open the player must not remain a competing
            // focus target. This is what previously left the full-screen root
            // focused after opening the drawer on the TV emulator.
            .focusable(enabled = !showSideSheet),
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
        when {
            terminalError != null -> PlayerErrorOverlay(
                message = terminalError,
                enabled = !showSideSheet,
                onOpenChannelList = {
                    showSideSheet = true
                    showInfo = false
                },
                onActionFocusChanged = { errorActionFocused = it },
                modifier = Modifier.align(Alignment.Center),
            )
            catalogError != null -> PlayerErrorOverlay(
                message = catalogError.message,
                enabled = !showSideSheet,
                onOpenChannelList = {
                    showSideSheet = true
                    showInfo = false
                },
                onActionFocusChanged = { errorActionFocused = it },
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
                    onActionFocusChanged = { infoActionFocused = it },
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
            selectedFilter = uiState.selectedChannelFilter,
            favoriteChannelIds = uiState.favoriteChannelIds,
            currentChannelId = playerState.channelId,
            currentChannelName = playerState.channelName,
            guidesByChannel = uiState.guidesByChannel,
            guideWindow = uiState.guideWindow,
            tuneError = uiState.tuneError,
            selectedDate = uiState.selectedDate,
            onSelectFilter = { viewModel.selectChannelFilter(it) },
            onSelectDate = { viewModel.selectDate(it) },
            onShiftGuideWindow = { viewModel.shiftGuideWindow(it) },
            onSelectChannel = { channel -> viewModel.requestTune(channel) },
            onPlayCurrent = { viewModel.tuneCurrent() },
            onChannelFocused = { channel -> viewModel.onChannelFocused(channel.id) },
            onVisibleGuideChannelsChanged = { ids -> viewModel.onVisibleGuideChannelsChanged(ids) },
            onToggleCurrentFavorite = viewModel::toggleFavoriteCurrentChannel,
            onReconfigure = onReconfigure,
            onClose = {
                showSideSheet = false
                showInfo = false
            },
            modifier = Modifier.fillMaxSize(),
        )
    }
}
