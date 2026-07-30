package com.magi.tv.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.magi.tv.ui.MagiTvActionButton
import com.magi.tv.ui.MagiTvPalette
import com.magi.tv.ui.MagiTvWordmark

@Composable
fun SetupScreen(
    state: SetupUiState,
    onAction: (SetupAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxSize()
            .background(MagiTvPalette.Background)
            .padding(horizontal = 64.dp, vertical = 48.dp),
        horizontalArrangement = Arrangement.spacedBy(72.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier
                .weight(0.9f)
                .fillMaxHeight(),
        ) {
            MagiTvWordmark()
            Spacer(Modifier.weight(0.8f))
            Text(
                text = "连接你的\nMAGI 服务器",
                color = MagiTvPalette.Text,
                fontSize = 46.sp,
                lineHeight = 56.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(20.dp))
            Text(
                text = "完成一次配置，即可在电视上浏览频道、节目单并自动选择可用播放线路。",
                color = MagiTvPalette.Muted,
                fontSize = 18.sp,
                lineHeight = 28.sp,
                modifier = Modifier.widthIn(max = 560.dp),
            )
            Spacer(Modifier.height(34.dp))
            SetupStep(number = "1", text = "在 MAGI 后台创建开放接口 API Key")
            Spacer(Modifier.height(16.dp))
            SetupStep(number = "2", text = "填写同一局域网内的服务器地址")
            Spacer(Modifier.height(16.dp))
            SetupStep(number = "3", text = "连接后使用遥控器浏览和播放")
            Spacer(Modifier.weight(1f))
            Text(
                text = "你的 API Key 只保存在这台设备上。",
                color = MagiTvPalette.Subtle,
                fontSize = 14.sp,
            )
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .widthIn(max = 620.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(MagiTvPalette.Surface)
                .border(1.dp, MagiTvPalette.Border, RoundedCornerShape(16.dp))
                .padding(horizontal = 38.dp, vertical = 36.dp),
        ) {
            Text(
                text = "首次配置",
                color = MagiTvPalette.Text,
                style = MaterialTheme.typography.headlineMedium,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "请输入服务器连接信息",
                color = MagiTvPalette.Muted,
                style = MaterialTheme.typography.bodyLarge,
            )
            Spacer(Modifier.height(30.dp))

            SetupTextField(
                value = state.serverUrl,
                onValueChange = {
                    onAction(SetupAction.ChangeServerUrl(it))
                },
                label = "服务器地址",
                placeholder = "http://192.168.1.10:3001",
                keyboardType = KeyboardType.Uri,
            )
            Spacer(Modifier.height(18.dp))
            SetupTextField(
                value = state.apiKey,
                onValueChange = {
                    onAction(SetupAction.ChangeApiKey(it))
                },
                label = "API Key",
                placeholder = "magi_xxxxxxxxxxxxxxxx",
                keyboardType = KeyboardType.Password,
                password = true,
            )
            Spacer(Modifier.height(30.dp))
            MagiTvActionButton(
                label = if (state.saving) "正在保存…" else "连接",
                onClick = { onAction(SetupAction.Save) },
                modifier = Modifier.fillMaxWidth(),
                primary = true,
                enabled = state.canSave,
            )
            state.errorMessage?.let { error ->
                Spacer(Modifier.height(12.dp))
                Text(
                    text = error,
                    color = MagiTvPalette.Error,
                    fontSize = 14.sp,
                )
            }
            Spacer(Modifier.height(18.dp))
            Text(
                text = "连接后如需更换服务器，可清除应用数据重新配置。",
                color = MagiTvPalette.Subtle,
                fontSize = 14.sp,
                lineHeight = 19.sp,
            )
        }
    }
}

@Composable
private fun SetupStep(number: String, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .width(32.dp)
                .height(32.dp)
                .clip(CircleShape)
                .background(MagiTvPalette.PrimarySoft)
                .border(1.dp, MagiTvPalette.Primary, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = number,
                color = MagiTvPalette.Primary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.width(14.dp))
        Text(
            text = text,
            color = MagiTvPalette.Text,
            fontSize = 16.sp,
        )
    }
}

@Composable
private fun SetupTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String,
    keyboardType: KeyboardType,
    password: Boolean = false,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 68.dp),
        label = { Text(label) },
        placeholder = { Text(placeholder) },
        singleLine = true,
        shape = RoundedCornerShape(10.dp),
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        visualTransformation = if (password) {
            PasswordVisualTransformation()
        } else {
            androidx.compose.ui.text.input.VisualTransformation.None
        },
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = MagiTvPalette.Text,
            unfocusedTextColor = MagiTvPalette.Text,
            cursorColor = MagiTvPalette.Primary,
            focusedBorderColor = MagiTvPalette.Primary,
            unfocusedBorderColor = MagiTvPalette.Border,
            focusedLabelColor = MagiTvPalette.Primary,
            unfocusedLabelColor = MagiTvPalette.Muted,
            focusedPlaceholderColor = MagiTvPalette.Subtle,
            unfocusedPlaceholderColor = MagiTvPalette.Subtle,
            focusedContainerColor = MagiTvPalette.SurfaceElevated,
            unfocusedContainerColor = MagiTvPalette.SurfaceElevated,
            disabledContainerColor = MagiTvPalette.SurfaceElevated,
        ),
    )
}
