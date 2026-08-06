package com.magi.tv.data.cache

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.withTransaction

@Entity(tableName = "tv_cached_groups")
data class CachedGroupEntity(
    @PrimaryKey val groupKey: String,
    val name: String?,
    val count: Int,
)

@Entity(tableName = "tv_cached_channels")
data class CachedChannelEntity(
    @PrimaryKey val id: String,
    val name: String,
    val groupName: String?,
    val logo: String?,
    val channelNumber: Int?,
)

@Entity(tableName = "tv_cached_guide_windows")
data class CachedGuideWindowEntity(
    @PrimaryKey val windowKey: String,
    val channelId: String,
    val fromEpochMs: Long,
    val toEpochMs: Long,
    val fetchedAtEpochMs: Long,
    val expiresAtEpochMs: Long,
    val epgRevision: String,
    val etag: String?,
)

@Entity(tableName = "tv_cached_programmes")
data class CachedProgrammeEntity(
    @PrimaryKey val programmeKey: String,
    val windowKey: String,
    val channelId: String,
    val title: String?,
    val subTitle: String?,
    val startAtEpochMs: Long,
    val stopAtEpochMs: Long,
    val category: String?,
)

@Entity(tableName = "tv_content_meta")
data class ContentMetaEntity(
    @PrimaryKey val id: Int = 1,
    val catalogRevision: String,
    val epgRevision: String,
    val catalogEtag: String?,
)

@Dao
interface ContentCatalogDao {
    @Query("SELECT * FROM tv_cached_groups ORDER BY groupKey")
    suspend fun listGroups(): List<CachedGroupEntity>

    @Query("SELECT * FROM tv_cached_channels ORDER BY channelNumber IS NULL, channelNumber, name, id")
    suspend fun listChannels(): List<CachedChannelEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertGroups(groups: List<CachedGroupEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertChannels(channels: List<CachedChannelEntity>)

    @Query("DELETE FROM tv_cached_groups")
    suspend fun deleteGroups()

    @Query("DELETE FROM tv_cached_channels")
    suspend fun deleteChannels()
}

@Dao
interface ContentGuideDao {
    @Query("SELECT * FROM tv_cached_guide_windows WHERE windowKey = :windowKey LIMIT 1")
    suspend fun findWindow(windowKey: String): CachedGuideWindowEntity?

    @Query("SELECT * FROM tv_cached_programmes WHERE windowKey = :windowKey ORDER BY startAtEpochMs, stopAtEpochMs")
    suspend fun listProgrammes(windowKey: String): List<CachedProgrammeEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWindow(window: CachedGuideWindowEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProgrammes(programmes: List<CachedProgrammeEntity>)

    @Query("DELETE FROM tv_cached_programmes WHERE windowKey = :windowKey")
    suspend fun deleteProgrammes(windowKey: String)
}

@Dao
interface ContentMetaDao {
    @Query("SELECT * FROM tv_content_meta WHERE id = 1 LIMIT 1")
    suspend fun get(): ContentMetaEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(meta: ContentMetaEntity)
}

@Database(
    entities = [
        CachedGroupEntity::class,
        CachedChannelEntity::class,
        CachedGuideWindowEntity::class,
        CachedProgrammeEntity::class,
        ContentMetaEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class ContentCacheDatabase : RoomDatabase() {
    abstract fun catalogDao(): ContentCatalogDao
    abstract fun guideDao(): ContentGuideDao
    abstract fun metaDao(): ContentMetaDao

    companion object {
        fun create(context: Context): ContentCacheDatabase = Room.databaseBuilder(
            context,
            ContentCacheDatabase::class.java,
            "magi-tv-content-cache.db",
        ).fallbackToDestructiveMigration().build()
    }
}

data class CachedCatalog(
    val groups: List<CachedGroupEntity>,
    val channels: List<CachedChannelEntity>,
    val meta: ContentMetaEntity,
)

data class CachedGuide(
    val window: CachedGuideWindowEntity,
    val programmes: List<CachedProgrammeEntity>,
    val fresh: Boolean,
)

/** Transactional facade around the TV content cache. Playback URLs never enter this store. */
class RoomContentCache(
    private val database: ContentCacheDatabase,
) {
    suspend fun readCatalog(): CachedCatalog? = database.withTransaction {
        val meta = database.metaDao().get() ?: return@withTransaction null
        val groups = database.catalogDao().listGroups()
        val channels = database.catalogDao().listChannels()
        // A guide-only write creates the meta row too. Treat that state as a
        // catalog miss unless the catalog request left an ETag behind; an
        // empty catalog with an ETag is a valid server response.
        if (groups.isEmpty() && channels.isEmpty() && meta.catalogEtag == null) {
            return@withTransaction null
        }
        CachedCatalog(
            groups = groups,
            channels = channels,
            meta = meta,
        )
    }

    suspend fun writeCatalog(
        groups: List<CachedGroupEntity>,
        channels: List<CachedChannelEntity>,
        catalogRevision: String,
        epgRevision: String,
        etag: String?,
    ) = database.withTransaction {
        database.catalogDao().deleteGroups()
        database.catalogDao().deleteChannels()
        if (groups.isNotEmpty()) database.catalogDao().insertGroups(groups)
        if (channels.isNotEmpty()) database.catalogDao().insertChannels(channels)
        database.metaDao().put(
            ContentMetaEntity(
                catalogRevision = catalogRevision,
                epgRevision = epgRevision,
                catalogEtag = etag,
            ),
        )
    }

    suspend fun readGuide(
        windowKey: String,
        nowEpochMs: Long,
    ): CachedGuide? = database.withTransaction {
        val window = database.guideDao().findWindow(windowKey) ?: return@withTransaction null
        val meta = database.metaDao().get()
        CachedGuide(
            window = window,
            programmes = database.guideDao().listProgrammes(windowKey),
            fresh = window.expiresAtEpochMs > nowEpochMs &&
                (meta == null || meta.epgRevision == window.epgRevision),
        )
    }

    suspend fun writeGuide(
        window: CachedGuideWindowEntity,
        programmes: List<CachedProgrammeEntity>,
        catalogRevision: String,
        epgRevision: String,
        catalogEtag: String?,
    ) = database.withTransaction {
        database.guideDao().deleteProgrammes(window.windowKey)
        database.guideDao().insertWindow(window)
        if (programmes.isNotEmpty()) database.guideDao().insertProgrammes(programmes)
        val current = database.metaDao().get()
        database.metaDao().put(
            ContentMetaEntity(
                catalogRevision = catalogRevision,
                epgRevision = epgRevision,
                catalogEtag = catalogEtag ?: current?.catalogEtag,
            ),
        )
    }

    suspend fun readRevision(): ContentMetaEntity? = database.metaDao().get()

    suspend fun updateEpgRevision(epgRevision: String) {
        database.withTransaction {
            val current = database.metaDao().get()
            database.metaDao().put(
                ContentMetaEntity(
                    catalogRevision = current?.catalogRevision ?: "1",
                    epgRevision = epgRevision,
                    catalogEtag = current?.catalogEtag,
                ),
            )
        }
    }
}
