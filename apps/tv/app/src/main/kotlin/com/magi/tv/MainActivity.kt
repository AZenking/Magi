package com.magi.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.magi.tv.ui.MagiTvTheme
import com.magi.tv.ui.TvApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = applicationContext as MagiTvApp
        setContent {
            MagiTvTheme {
                TvApp(appContainer = app.appContainer)
            }
        }
    }
}
