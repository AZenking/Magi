package com.magi.tv.data.repository

import com.magi.tv.data.cache.CachedCatalog
import com.magi.tv.data.cache.CachedChannelEntity
import com.magi.tv.data.cache.CachedGroupEntity
import com.magi.tv.data.cache.CachedGuideWindowEntity
import com.magi.tv.data.cache.CachedProgrammeEntity
import com.magi.tv.data.cache.RoomContentCache
import com.magi.tv.data.remote.ChannelDto
import com.magi.tv.data.remote.ChannelGroupDto
import com.magi.tv.data.remote.ContentSnapshotDto
import com.magi.tv.data.remote.MagiRemoteDataSource
import com.magi.tv.data.remote.PlaybackDecisionDto
import com.magi.tv.data.remote.PlaybackLineDto
import com.magi.tv.data.remote.ProgrammeDto
import com.magi.tv.domain.model.Channel
import com.magi.tv.domain.model.ChannelCatalog
import com.magi.tv.domain.model.ChannelGroup
import com.magi.tv.domain.model.ContentChange
import com.magi.tv.domain.model.ContentRevision
import com.magi.tv.domain.model.PlaybackDecision
import com.magi.tv.domain.model.PlaybackLine
import com.magi.tv.domain.model.Programme
import com.magi.tv.domain.repository.ContentSyncRepository
import com.magi.tv.domain.repository.TvContentRepository
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Cache-first content repository. Catalog and guide data are durable in Room;
 * playback decisions remain a short-lived in-memory cache because they contain
 * operational URLs and health state.
 */
class CachedTvContentRepository(
    private val remoteDataSource: MagiRemoteDataSource,
    private val cache: RoomContentCache,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
) : TvContentRepository, ContentSyncRepository {
    private val catalogMutex = Mutex()
    private val guideMutex = Mutex()
    private val playbackMutex = Mutex()
    private val _changes = MutableSharedFlow<ContentChange>(replay = 1, extraBufferCapacity = 1)
    private val playbackCache = mutableMapOf<String, PlaybackCacheEntry>()
    private val playbackFlights = mutableMapOf<String, CompletableDeferred<PlaybackDecision>>()
    private val guideRefreshJobs = mutableMapOf<String, Job>()
    private var catalogRefreshJob: Job? = null
    @Volatile private var lastCatalogRefreshAttemptEpochMs = 0L

    override val changes: Flow<ContentChange> = _changes.asSharedFlow()

    override suspend fun getChannelCatalog(group: String?): ChannelCatalog {
        val cached = cache.readCatalog()
        val catalog = if (cached != null) {
            scheduleCatalogRefresh(cached)
            cached.toDomainCatalog()
        } else {
            catalogMutex.withLock {
                cache.readCatalog()?.toDomainCatalog() ?: refreshCatalogNow(null)
            }
        }
        return if (group == null) catalog else catalog.copy(
            channels = catalog.channels.filter { it.group == group },
        )
    }

    override suspend fun resolvePlayback(channelId: String): PlaybackDecision {
        val normalizedId = channelId.removePrefix("magi:")
        val now = System.currentTimeMillis()
        playbackMutex.withLock {
            playbackCache[normalizedId]
                ?.takeIf { it.expiresAtEpochMs > now }
                ?.decision
        }?.let { return it }

        var leader = false
        val flight = playbackMutex.withLock {
            playbackFlights[normalizedId]?.also { return@withLock it }
                ?: CompletableDeferred<PlaybackDecision>().also {
                    playbackFlights[normalizedId] = it
                    leader = true
                }
        }
        if (!leader) return flight.await()

        try {
            val decision = remoteDataSource.getPlayback(normalizedId).toDomain()
            val expiresAt = parseExpiry(decision.decisionExpiresAt)
            playbackMutex.withLock {
                playbackCache[normalizedId] = PlaybackCacheEntry(decision, expiresAt)
                playbackFlights.remove(normalizedId)
            }
            flight.complete(decision)
            return decision
        } catch (error: Throwable) {
            playbackMutex.withLock { playbackFlights.remove(normalizedId) }
            flight.completeExceptionally(error)
            throw error
        }
    }

    override suspend fun getProgrammeGuide(
        channelId: String?,
        fromEpochMs: Long,
        toEpochMs: Long,
    ): List<Programme> {
        if (channelId == null) {
            return remoteDataSource.getProgrammeGuide(null, fromEpochMs.toIsoUtc(), toEpochMs.toIsoUtc())
                .map(ProgrammeDto::toDomain)
        }
        return getProgrammeGuideBatch(listOf(channelId), fromEpochMs, toEpochMs)
            .getValue(channelId.removePrefix("magi:"))
    }

    override suspend fun getProgrammeGuideBatch(
        channelIds: Collection<String>,
        fromEpochMs: Long,
        toEpochMs: Long,
    ): Map<String, List<Programme>> {
        val ids = channelIds.map { it.removePrefix("magi:") }.distinct()
        if (ids.isEmpty()) return emptyMap()
        val specs = ids.map { GuideSpec(it, fromEpochMs, toEpochMs) }
        val cached = specs.associateWith { cache.readGuide(it.key, System.currentTimeMillis()) }
        val stale = cached.filterValues { it != null && !it.fresh }.keys.toList()
        if (stale.isNotEmpty()) scheduleGuideRefresh(stale)

        val missing = cached.filterValues { it == null }.keys.toList()
        if (missing.isNotEmpty()) {
            guideMutex.withLock {
                val unresolved = missing.filter {
                    cache.readGuide(it.key, System.currentTimeMillis()) == null
                }
                if (unresolved.isNotEmpty()) fetchGuideNow(unresolved)
            }
        }

        return specs.associate { spec ->
            spec.id to (cache.readGuide(spec.key, System.currentTimeMillis())?.programmes
                ?.map(CachedProgrammeEntity::toDomain).orEmpty())
        }
    }

    override suspend fun isProgrammeGuideStale(
        channelId: String,
        fromEpochMs: Long,
        toEpochMs: Long,
    ): Boolean = cache.readGuide(
        windowKey = GuideSpec(channelId.removePrefix("magi:"), fromEpochMs, toEpochMs).key,
        nowEpochMs = System.currentTimeMillis(),
    )?.fresh == false

    override suspend fun syncIfChanged(revision: ContentRevision) {
        val local = cache.readRevision()
        val catalogChanged = local?.catalogRevision != revision.catalog
        val epgChanged = local?.epgRevision != revision.epg
        if (!catalogChanged && !epgChanged) return

        var catalogRefreshSucceeded = false
        if (catalogChanged) {
            catalogRefreshSucceeded = runCatching {
                catalogMutex.withLock {
                    refreshCatalogNow(local?.catalogEtag)
                }
            }.isSuccess
        }
        if (epgChanged && !catalogRefreshSucceeded) {
            cache.updateEpgRevision(revision.epg)
        }
        _changes.emit(
            ContentChange(
                revision = revision,
                catalogChanged = catalogChanged,
                epgChanged = epgChanged,
            ),
        )
    }

    private fun scheduleCatalogRefresh(cached: CachedCatalog) {
        val now = System.currentTimeMillis()
        if (now - lastCatalogRefreshAttemptEpochMs < CATALOG_REFRESH_MIN_INTERVAL_MS) return
        if (catalogRefreshJob?.isActive == true) return
        lastCatalogRefreshAttemptEpochMs = now
        catalogRefreshJob = scope.launch {
            runCatching {
                catalogMutex.withLock { refreshCatalogNow(cached.meta.catalogEtag) }
            }
        }
    }

    private suspend fun refreshCatalogNow(ifNoneMatch: String?): ChannelCatalog {
        lastCatalogRefreshAttemptEpochMs = System.currentTimeMillis()
        val response = remoteDataSource.getContentSnapshot(
            include = "catalog",
            ifNoneMatch = ifNoneMatch,
        )
        if (response.notModified) {
            return cache.readCatalog()?.toDomainCatalog() ?: ChannelCatalog(emptyList(), emptyList())
        }
        val snapshot = response.snapshot ?: error("内容快照为空")
        val catalog = snapshot.toDomainCatalog()
        cache.writeCatalog(
            groups = snapshot.groups.map(ChannelGroupDto::toEntity),
            channels = snapshot.channels.map(ChannelDto::toEntity),
            catalogRevision = snapshot.catalogRevision,
            epgRevision = snapshot.epgRevision,
            etag = response.etag,
        )
        return catalog
    }

    private fun scheduleGuideRefresh(specs: List<GuideSpec>) {
        val newSpecs = specs.filter { spec ->
            synchronized(guideRefreshJobs) {
                guideRefreshJobs[spec.key]?.isActive != true
            }
        }
        if (newSpecs.isEmpty()) return
        newSpecs.chunked(MAX_GUIDE_CHANNELS_PER_REQUEST).forEach { chunk ->
            synchronized(guideRefreshJobs) {
                if (chunk.any { guideRefreshJobs[it.key]?.isActive == true }) return@synchronized
                val refreshJob = scope.launch {
                    try {
                        guideMutex.withLock { fetchGuideNow(chunk) }
                        cache.readRevision()?.let { meta ->
                            _changes.tryEmit(
                                ContentChange(
                                    revision = ContentRevision(meta.catalogRevision, meta.epgRevision),
                                    catalogChanged = false,
                                    epgChanged = true,
                                ),
                            )
                        }
                    } catch (_: Exception) {
                        // The stale Room value remains usable; the next focus
                        // or heartbeat retries after the normal debounce.
                    } finally {
                        synchronized(guideRefreshJobs) {
                            chunk.forEach { guideRefreshJobs.remove(it.key) }
                        }
                    }
                }
                chunk.forEach { guideRefreshJobs[it.key] = refreshJob }
            }
        }
    }

    private suspend fun fetchGuideNow(specs: List<GuideSpec>) {
        specs.chunked(MAX_GUIDE_CHANNELS_PER_REQUEST).forEach { chunk ->
            val snapshotResponse = remoteDataSource.getContentSnapshot(
                include = "guide",
                channelIds = chunk.map { it.id },
                fromIso = chunk.first().fromEpochMs.toIsoUtc(),
                toIso = chunk.first().toEpochMs.toIsoUtc(),
            )
            if (snapshotResponse.notModified) return@forEach
            val snapshot = snapshotResponse.snapshot ?: return@forEach
            val grouped = snapshot.programmes.groupBy { it.channelId.removePrefix("magi:") }
            chunk.forEach { spec ->
                val programmes = grouped[spec.id].orEmpty().map(ProgrammeDto::toDomain)
                val now = System.currentTimeMillis()
                cache.writeGuide(
                    window = CachedGuideWindowEntity(
                        windowKey = spec.key,
                        channelId = spec.id,
                        fromEpochMs = spec.fromEpochMs,
                        toEpochMs = spec.toEpochMs,
                        fetchedAtEpochMs = now,
                        expiresAtEpochMs = now + guideTtl(spec),
                        epgRevision = snapshot.epgRevision,
                        etag = snapshotResponse.etag,
                    ),
                    programmes = programmes.mapIndexed { index, programme ->
                        programme.toEntity(spec.key, index)
                    },
                    catalogRevision = snapshot.catalogRevision,
                    epgRevision = snapshot.epgRevision,
                    catalogEtag = null,
                )
            }
        }
    }

    private fun guideTtl(spec: GuideSpec): Long =
        if (Instant.ofEpochMilli(spec.fromEpochMs).atZone(ZoneOffset.UTC).toLocalDate() ==
            Instant.now().atZone(ZoneOffset.UTC).toLocalDate()
        ) 5 * 60 * 1000L else 30 * 60 * 1000L

    private data class GuideSpec(
        val id: String,
        val fromEpochMs: Long,
        val toEpochMs: Long,
    ) {
        val key: String get() = "$id:$fromEpochMs:$toEpochMs"
    }

    private data class PlaybackCacheEntry(
        val decision: PlaybackDecision,
        val expiresAtEpochMs: Long,
    )

    companion object {
        private const val MAX_GUIDE_CHANNELS_PER_REQUEST = 3
        private const val CATALOG_REFRESH_MIN_INTERVAL_MS = 60_000L
    }
}

private fun CachedCatalog.toDomainCatalog(): ChannelCatalog = ChannelCatalog(
    groups = groups.map { ChannelGroup(it.name, it.count) },
    channels = channels.map {
        Channel(
            id = publicChannelId(it.id),
            name = it.name,
            group = it.groupName,
            logo = it.logo,
            channelNumber = it.channelNumber,
        )
    },
)

private fun ContentSnapshotDto.toDomainCatalog(): ChannelCatalog = ChannelCatalog(
    groups = groups.map(ChannelGroupDto::toDomain),
    channels = channels.map(ChannelDto::toDomain),
)

private fun ChannelGroupDto.toDomain() = ChannelGroup(name = name, count = count)

private fun ChannelDto.toDomain() = Channel(
    id = publicChannelId(id),
    name = name,
    group = group,
    logo = logo,
    channelNumber = channelNumber,
)

private fun ChannelGroupDto.toEntity() = CachedGroupEntity(
    groupKey = name ?: "",
    name = name,
    count = count,
)

private fun ChannelDto.toEntity() = CachedChannelEntity(
    id = id.removePrefix("magi:"),
    name = name,
    groupName = group,
    logo = logo,
    channelNumber = channelNumber,
)

private fun ProgrammeDto.toDomain() = Programme(
    channelId = publicChannelId(channelId),
    title = title,
    subTitle = subTitle,
    startAt = startAt.parseEpochMsOrThrow(),
    stopAt = stopAt.parseEpochMsOrThrow(),
    category = category,
)

private fun Programme.toEntity(windowKey: String, index: Int) = CachedProgrammeEntity(
    programmeKey = "$windowKey:$startAt:$stopAt:$index",
    windowKey = windowKey,
    channelId = channelId.removePrefix("magi:"),
    title = title,
    subTitle = subTitle,
    startAtEpochMs = startAt,
    stopAtEpochMs = stopAt,
    category = category,
)

private fun CachedProgrammeEntity.toDomain() = Programme(
    channelId = publicChannelId(channelId),
    title = title,
    subTitle = subTitle,
    startAt = startAtEpochMs,
    stopAt = stopAtEpochMs,
    category = category,
)

private fun PlaybackDecisionDto.toDomain() = PlaybackDecision(
    channelId = channelId,
    playable = playable,
    primary = primary?.toDomain(),
    fallbacks = fallbacks.map(PlaybackLineDto::toDomain),
    decisionExpiresAt = decisionExpiresAt,
    deliveryMode = deliveryMode,
)

private fun PlaybackLineDto.toDomain() = PlaybackLine(
    streamId = streamId,
    url = url,
    format = format,
    health = health,
)

private fun publicChannelId(id: String): String =
    "magi:${id.removePrefix("magi:")}"

private fun parseExpiry(value: String): Long = runCatching {
    Instant.parse(value).toEpochMilli()
}.getOrElse { System.currentTimeMillis() + 5 * 60 * 1000L }

private fun String.parseEpochMsOrThrow(): Long = try {
    Instant.parse(this).toEpochMilli()
} catch (error: DateTimeParseException) {
    Instant.from(DateTimeFormatter.ISO_DATE_TIME.parse(this)).toEpochMilli()
}

private fun Long.toIsoUtc(): String =
    DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(this).atOffset(ZoneOffset.UTC))
