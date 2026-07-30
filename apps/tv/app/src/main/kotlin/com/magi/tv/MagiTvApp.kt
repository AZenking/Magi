package com.magi.tv

import android.app.Application
import com.magi.tv.di.AppContainer

/**
 * Application composition root. Long-lived repositories are created once here;
 * feature-specific dependencies are built by [AppContainer].
 */
class MagiTvApp : Application() {
    lateinit var appContainer: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        appContainer = AppContainer(this)
    }
}
