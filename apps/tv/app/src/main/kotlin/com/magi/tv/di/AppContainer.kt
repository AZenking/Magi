package com.magi.tv.di

import android.content.Context
import com.magi.tv.data.auth.TokenManager
import com.magi.tv.data.remote.MagiClient
import com.magi.tv.data.remote.MagiRemoteDataSource
import com.magi.tv.data.repository.DefaultTvContentRepository
import com.magi.tv.data.repository.InMemoryDiagnosticsRepository
import com.magi.tv.data.repository.LastChannelStore
import com.magi.tv.domain.repository.DiagnosticsRepository
import com.magi.tv.domain.usecase.GetChannelCatalogUseCase
import com.magi.tv.domain.usecase.GetProgrammeGuideUseCase
import com.magi.tv.domain.usecase.ResolvePlaybackUseCase

/**
 * Small-app manual dependency injection (004-safe-operations).
 *
 * Configuration (serverUrl + OAuth2 credentials) is compiled into the APK via
 * BuildConfig. There is no runtime setup — the app boots straight into live
 * playback (zero-input launch).
 */
class AppContainer(context: Context) {
    val diagnosticsRepository: DiagnosticsRepository =
        InMemoryDiagnosticsRepository()

    val lastChannelStore: LastChannelStore =
        LastChannelStore(context.applicationContext)

    val tokenManager: TokenManager =
        TokenManager(context.applicationContext)

    /**
     * Creates the TV session: builds the Retrofit client with the OAuth2
     * TokenManager (auto-refresh on 401), wires up the remote data source +
     * repository, and returns the use-cases needed by the ViewModel.
     */
    fun createTvSession(): TvSessionDependencies {
        val api = MagiClient.create(tokenManager)
        val repository = DefaultTvContentRepository(
            remoteDataSource = MagiRemoteDataSource(api),
        )
        return TvSessionDependencies(
            getChannelCatalog = GetChannelCatalogUseCase(repository),
            resolvePlayback = ResolvePlaybackUseCase(repository),
            getProgrammeGuide = GetProgrammeGuideUseCase(repository),
        )
    }
}

data class TvSessionDependencies(
    val getChannelCatalog: GetChannelCatalogUseCase,
    val resolvePlayback: ResolvePlaybackUseCase,
    val getProgrammeGuide: GetProgrammeGuideUseCase,
)
