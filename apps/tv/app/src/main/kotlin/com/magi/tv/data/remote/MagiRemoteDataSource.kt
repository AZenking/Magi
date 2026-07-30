package com.magi.tv.data.remote

class MagiRemoteDataSource(
    private val api: OpenApi,
) {
    suspend fun getGroups(): List<ChannelGroupDto> =
        api.groups().requireData()

    suspend fun getChannels(group: String?): List<ChannelDto> =
        api.channels(group = group).requireData().items

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
