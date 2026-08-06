package com.magi.tv.data.remote

class MagiRemoteDataSource(
    private val api: OpenApi,
) {
    suspend fun getGroups(): List<ChannelGroupDto> =
        api.groups().requireData()

    suspend fun getChannels(group: String?): List<ChannelDto> {
        // Fetch ALL pages so the TV has the complete channel directory for
        // channel-surfing + last-channel resume. Server returns stable ordering
        // (channelNumber → name → id), so concatenation is deterministic.
        val first = api.channels(group = group, page = 1, pageSize = 100).requireData()
        if (first.totalPages <= 1) return first.items

        val all = mutableListOf<ChannelDto>()
        all.addAll(first.items)
        for (page in 2..first.totalPages) {
            val pageData = api.channels(group = group, page = page, pageSize = 100).requireData()
            all.addAll(pageData.items)
        }
        // Defensive dedup by id (correctness relies on server ordering, not this).
        return all.distinctBy { it.id }
    }

    suspend fun getPlayback(channelId: String): PlaybackDecisionDto =
        api.playback(channelId).requireData()

    suspend fun getProgrammeGuide(
        channelId: String?,
        fromIso: String,
        toIso: String,
    ): List<ProgrammeDto> =
        api.epg(
            from = fromIso,
            to = toIso,
            channelId = channelId,
        ).requireData().items

    suspend fun getContentSnapshot(
        include: String,
        channelIds: List<String> = emptyList(),
        fromIso: String? = null,
        toIso: String? = null,
        ifNoneMatch: String? = null,
    ): RemoteContentSnapshot {
        val response = api.contentSnapshot(
            include = include,
            channelIds = channelIds.map { it.removePrefix("magi:") },
            from = fromIso,
            to = toIso,
            ifNoneMatch = ifNoneMatch,
        )
        val etag = response.headers()["ETag"]
        if (response.code() == 304) {
            return RemoteContentSnapshot(snapshot = null, etag = etag, notModified = true)
        }
        if (!response.isSuccessful) {
            throw RemoteDataException("内容快照请求失败: HTTP ${response.code()}")
        }
        return RemoteContentSnapshot(
            snapshot = response.body()?.requireData()
                ?: throw RemoteDataException("服务返回了无效内容快照"),
            etag = etag,
            notModified = false,
        )
    }

    private fun <T> ApiEnvelopeDto<T>.requireData(): T {
        if (!success || data == null) {
            throw RemoteDataException("服务返回了无效响应")
        }
        return data
    }
}

data class RemoteContentSnapshot(
    val snapshot: ContentSnapshotDto?,
    val etag: String?,
    val notModified: Boolean,
)

class RemoteDataException(message: String) : IllegalStateException(message)
