package com.magi.tv

import android.app.Application
import androidx.lifecycle.ProcessLifecycleOwner
import com.magi.tv.di.AppContainer

/**
 * Application composition root. Long-lived repositories are created once here;
 * feature-specific dependencies are built by [AppContainer].
 *
 * Coil 3's network support (coil-network-okhttp) is auto-discovered via
 * ServiceLoader when the dependency is on the classpath — no manual
 * SingletonImageLoader.Factory needed.
 */
class MagiTvApp : Application() {
    lateinit var appContainer: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        appContainer = AppContainer(this)
        ProcessLifecycleOwner.get().lifecycle.addObserver(appContainer.heartbeatCoordinator)
    }
}
