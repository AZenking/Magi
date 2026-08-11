package com.magi.tv.ui.client

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.magi.tv.ui.MagiTvActionButton
import com.magi.tv.ui.MagiTvPalette
import com.magi.tv.ui.MagiTvScreenHeader

@Composable
fun ClientAuthorizationScreen(
    viewModel: ClientAuthorizationViewModel,
    onAuthorized: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val retryFocusRequester = androidx.compose.runtime.remember { FocusRequester() }
    LaunchedEffect(Unit) { viewModel.start() }
    LaunchedEffect(state.phase) {
        if (state.phase == ClientAuthorizationPhase.Authorized) onAuthorized()
        if (state.phase == ClientAuthorizationPhase.Failed) {
            runCatching { retryFocusRequester.requestFocus() }
        }
    }
    // There is no protected playback beneath this first-run surface. Let the
    // system Back action leave the app instead of swallowing the remote key.

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MagiTvPalette.Background)
            .padding(horizontal = 72.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        MagiTvScreenHeader(
            title = "连接此电视",
            subtitle = "设备将自动注册到默认账户",
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.weight(1f))
        Column(
            modifier = Modifier.fillMaxWidth(0.72f),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "正在将此电视加入客户端管理…",
                color = MagiTvPalette.Muted,
                fontSize = 20.sp,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.padding(12.dp))
            Text(
                text = if (state.phase == ClientAuthorizationPhase.Failed) {
                    "自动注册失败"
                } else {
                    "正在注册设备"
                },
                color = MagiTvPalette.Text,
                fontSize = 32.sp,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.padding(10.dp))
            Text(
                text = state.message ?: "首次启动会自动完成设备登记，无需输入授权码。",
                color = if (state.phase == ClientAuthorizationPhase.Failed) {
                    MagiTvPalette.Error
                } else {
                    MagiTvPalette.Muted
                },
                fontSize = 17.sp,
                textAlign = TextAlign.Center,
            )
        }
        Spacer(Modifier.weight(1f))
        Row(horizontalArrangement = Arrangement.Center) {
            if (state.phase == ClientAuthorizationPhase.Failed) {
                MagiTvActionButton(
                    label = "重试登记",
                    onClick = viewModel::retry,
                    modifier = Modifier.focusRequester(retryFocusRequester),
                    primary = true,
                )
                Spacer(Modifier.width(16.dp))
            }
            Text(
                text = "电视仅保存加密的刷新凭证，不会显示账户密码。",
                color = MagiTvPalette.Subtle,
                fontSize = 14.sp,
            )
        }
    }
}
