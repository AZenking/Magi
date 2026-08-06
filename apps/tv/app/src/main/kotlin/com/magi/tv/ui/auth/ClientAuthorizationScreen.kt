package com.magi.tv.ui.auth

import androidx.compose.runtime.Composable

@Composable
fun ClientAuthorizationScreen(
    viewModel: ClientAuthorizationViewModel,
    onAuthorized: () -> Unit,
) {
    com.magi.tv.ui.client.ClientAuthorizationScreen(viewModel, onAuthorized)
}
