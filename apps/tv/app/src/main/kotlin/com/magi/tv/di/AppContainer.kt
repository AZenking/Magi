package com.magi.tv.di

import android.content.Context
import com.magi.tv.data.auth.TokenManager
import com.magi.tv.data.cache.ContentCacheDatabase
import com.magi.tv.data.cache.RoomContentCache
import com.magi.tv.data.remote.MagiClient
import com.magi.tv.data.remote.MagiRemoteDataSource
import com.magi.tv.data.repository.DefaultClientSessionRepository
import com.magi.tv.data.repository.CachedTvContentRepository
import com.magi.tv.data.repository.ChannelPreferencesStore
import com.magi.tv.data.repository.InMemoryDiagnosticsRepository
import com.magi.tv.data.repository.LastChannelStore
import com.magi.tv.domain.repository.ClientCredentialStore
import com.magi.tv.domain.repository.ClientSessionRepository
import com.magi.tv.domain.repository.ContentSyncRepository
import com.magi.tv.domain.repository.DiagnosticsRepository
import com.magi.tv.domain.usecase.GetChannelCatalogUseCase
import com.magi.tv.domain.usecase.GetProgrammeGuideUseCase
import com.magi.tv.domain.usecase.ResolvePlaybackUseCase
import com.magi.tv.platform.client.ClientHeartbeatCoordinator
import com.magi.tv.platform.network.AndroidConnectivityMonitor
import com.magi.tv.platform.security.KeystoreClientCredentialStore

/**
 * Small-app manual dependency injection (004-safe-operations).
 *
 * The server URL and public software client id are compiled into the APK. The
 * device refresh token is enrolled at runtime and remains in Android Keystore.
 */
class AppContainer(context: Context) {
    private val appContext = context.applicationContext

    val diagnosticsRepository: DiagnosticsRepository =
        InMemoryDiagnosticsRepository()

    val lastChannelStore: LastChannelStore =
        LastChannelStore(context.applicationContext)

    val channelPreferencesStore: ChannelPreferencesStore =
        ChannelPreferencesStore(context.applicationContext)

    val credentialStore: ClientCredentialStore =
        KeystoreClientCredentialStore(appContext)

    val tokenManager: TokenManager =
        TokenManager(credentialStore)

    private val contentCacheDatabase: ContentCacheDatabase =
        ContentCacheDatabase.create(appContext)

    private val contentCache: RoomContentCache =
        RoomContentCache(contentCacheDatabase)

    private val tvContentRepository: CachedTvContentRepository by lazy {
        CachedTvContentRepository(
            remoteDataSource = MagiRemoteDataSource(MagiClient.create(tokenManager)),
            cache = contentCache,
        )
    }

    val clientSessionRepository: ClientSessionRepository =
        DefaultClientSessionRepository(
            tokenManager = tokenManager,
            api = DefaultClientSessionRepository.createApi(),
            credentialStore = credentialStore,
        )

    val heartbeatCoordinator: ClientHeartbeatCoordinator =
        ClientHeartbeatCoordinator(
            repository = clientSessionRepository,
            credentialStore = credentialStore,
            connectivity = AndroidConnectivityMonitor(appContext),
            contentSyncRepository = tvContentRepository,
        )

    /**
     * Creates the TV session: builds the Retrofit client with the OAuth2
     * TokenManager (auto-refresh on 401), wires up the remote data source +
     * repository, and returns the use-cases needed by the ViewModel.
     */
    fun createTvSession(): TvSessionDependencies {
        return TvSessionDependencies(
            getChannelCatalog = GetChannelCatalogUseCase(tvContentRepository),
            resolvePlayback = ResolvePlaybackUseCase(tvContentRepository),
            getProgrammeGuide = GetProgrammeGuideUseCase(tvContentRepository),
            contentSyncRepository = tvContentRepository,
        )
    }
}

data class TvSessionDependencies(
    val getChannelCatalog: GetChannelCatalogUseCase,
    val resolvePlayback: ResolvePlaybackUseCase,
    val getProgrammeGuide: GetProgrammeGuideUseCase,
    val contentSyncRepository: ContentSyncRepository,
)
