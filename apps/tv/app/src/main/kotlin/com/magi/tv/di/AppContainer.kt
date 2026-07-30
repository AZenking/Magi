package com.magi.tv.di

import android.content.Context
import com.magi.tv.data.remote.MagiClient
import com.magi.tv.data.remote.MagiRemoteDataSource
import com.magi.tv.data.repository.DataStoreConnectionSettingsRepository
import com.magi.tv.data.repository.DefaultTvContentRepository
import com.magi.tv.data.repository.InMemoryDiagnosticsRepository
import com.magi.tv.data.repository.LastChannelStore
import com.magi.tv.domain.model.ConnectionSettings
import com.magi.tv.domain.repository.ConnectionSettingsRepository
import com.magi.tv.domain.repository.DiagnosticsRepository
import com.magi.tv.domain.usecase.GetChannelCatalogUseCase
import com.magi.tv.domain.usecase.GetProgrammeGuideUseCase
import com.magi.tv.domain.usecase.ResolvePlaybackUseCase
import com.magi.tv.domain.usecase.SaveConnectionSettingsUseCase

/**
 * Small-app manual dependency injection. Object construction stays outside
 * ViewModels, while a configured TV session shares one repository/client.
 */
class AppContainer(context: Context) {
    val settingsRepository: ConnectionSettingsRepository =
        DataStoreConnectionSettingsRepository(context.applicationContext)

    val diagnosticsRepository: DiagnosticsRepository =
        InMemoryDiagnosticsRepository()

    val lastChannelStore: LastChannelStore =
        LastChannelStore(context.applicationContext)

    val saveConnectionSettings =
        SaveConnectionSettingsUseCase(settingsRepository)

    fun createTvSession(settings: ConnectionSettings): TvSessionDependencies {
        check(settings.isConfigured) { "TV session requires configured settings" }
        val api = MagiClient.create(settings.serverUrl, settings.apiKey)
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
