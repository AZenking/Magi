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

    private fun <T> ApiEnvelopeDto<T>.requireData(): T {
        if (!success || data == null) {
            throw RemoteDataException("服务返回了无效响应")
        }
        return data
    }
}

class RemoteDataException(message: String) : IllegalStateException(message)
