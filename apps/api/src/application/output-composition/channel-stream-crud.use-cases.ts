import { Inject, Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import type { IChannelStreamRepository, ICanonicalChannelRepository, ChannelStream } from "@/domain/output-composition";
import type { IChannelRepository } from "@/domain/channel-catalog";

@Injectable()
export class FindChannelStreamsUseCase {
  constructor(
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streamRepo: IChannelStreamRepository,
  ) {}

  async execute(canonicalChannelId: string): Promise<ChannelStream[]> {
    return this.streamRepo.findByCanonicalChannelId(canonicalChannelId);
  }

  async executeFindOne(streamId: string): Promise<ChannelStream | null> {
    return this.streamRepo.findById(streamId);
  }
}

@Injectable()
export class CreateChannelStreamUseCase {
  constructor(
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streamRepo: IChannelStreamRepository,
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
    @Inject("CHANNEL_REPOSITORY")
    private readonly channelRepo: IChannelRepository,
  ) {}

  async execute(canonicalChannelId: string, data: { streamUrl: string; m3uSourceId?: string | null; sourceChannelId?: string | null }): Promise<ChannelStream> {
    const channel = await this.canonicalRepo.findById(canonicalChannelId);
    if (!channel) throw new NotFoundException("Channel not found");

    const existing = await this.streamRepo.findByCanonicalChannelId(canonicalChannelId);
    const isFirst = existing.length === 0;

    let streamUrl = data.streamUrl;
    let m3uSourceId = data.m3uSourceId ?? null;
    let sourceChannelId = data.sourceChannelId ?? null;
    let rawChannelId: string | null = null;

    // If sourceChannelId provided, validate and pull data from raw channel
    if (sourceChannelId) {
      const rawChannel = await this.channelRepo.findById(sourceChannelId);
      if (!rawChannel) throw new NotFoundException("Source channel not found");
      streamUrl = rawChannel.streamUrl ?? streamUrl;
      m3uSourceId = rawChannel.m3uSourceId;
      rawChannelId = rawChannel.rawChannelId;
    }

    const stream = await this.streamRepo.create({
      canonicalChannelId,
      streamUrl,
      m3uSourceId,
      rawChannelId,
      sourceChannelId,
      isPrimary: isFirst,
      healthStatus: "unknown",
      responseTime: null,
      lastCheckedAt: null,
      lastSuccessAt: null,
      consecutiveFailures: 0,
      successRate: null,
      streamError: null,
    streamCodec: null,
    streamFormat: null,
    streamWidth: null,
    streamHeight: null,
    streamFrameRate: null,
    streamBitrate: null,
    });

    // Sync canonical.primaryStreamId when creating the first stream
    if (isFirst) {
      await this.canonicalRepo.update(canonicalChannelId, { primaryStreamId: stream.id });
    }

    return stream;
  }
}

@Injectable()
export class UpdateChannelStreamUseCase {
  constructor(
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streamRepo: IChannelStreamRepository,
    @Inject("CHANNEL_REPOSITORY")
    private readonly channelRepo: IChannelRepository,
  ) {}

  async execute(streamId: string, data: { streamUrl?: string; m3uSourceId?: string | null; sourceChannelId?: string | null }): Promise<ChannelStream> {
    const stream = await this.streamRepo.findById(streamId);
    if (!stream) throw new NotFoundException("Stream not found");

    const update: Partial<ChannelStream> = {};

    if (data.streamUrl !== undefined) update.streamUrl = data.streamUrl;

    // If sourceChannelId provided, resolve source info from the raw channel
    if (data.sourceChannelId !== undefined && data.sourceChannelId) {
      const rawChannel = await this.channelRepo.findById(data.sourceChannelId);
      if (!rawChannel) throw new NotFoundException("Source channel not found");
      update.sourceChannelId = rawChannel.id;
      update.m3uSourceId = rawChannel.m3uSourceId;
      update.rawChannelId = rawChannel.rawChannelId;
      if (data.streamUrl === undefined && rawChannel.streamUrl) {
        update.streamUrl = rawChannel.streamUrl;
      }
    } else if (data.sourceChannelId === null) {
      // Explicitly clearing source binding
      update.sourceChannelId = null;
      update.rawChannelId = null;
    } else if (data.m3uSourceId !== undefined) {
      update.m3uSourceId = data.m3uSourceId;
    }

    const updated = await this.streamRepo.update(streamId, update);
    if (!updated) throw new NotFoundException("Stream not found");
    return updated;
  }
}

@Injectable()
export class DeleteChannelStreamUseCase {
  constructor(
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streamRepo: IChannelStreamRepository,
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
  ) {}

  async execute(streamId: string): Promise<void> {
    const stream = await this.streamRepo.findById(streamId);
    if (!stream) throw new NotFoundException("Stream not found");

    await this.streamRepo.deleteById(streamId);

    if (stream.isPrimary) {
      const remaining = await this.streamRepo.findByCanonicalChannelId(stream.canonicalChannelId);
      if (remaining.length > 0) {
        await this.streamRepo.update(remaining[0]!.id, { isPrimary: true });
      }
      await this.canonicalRepo.update(stream.canonicalChannelId, {
        primaryStreamId: remaining.length > 0 ? remaining[0]!.id : null,
      });
    }
  }
}

@Injectable()
export class SetPrimaryStreamUseCase {
  constructor(
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streamRepo: IChannelStreamRepository,
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
  ) {}

  async execute(streamId: string): Promise<ChannelStream> {
    const stream = await this.streamRepo.findById(streamId);
    if (!stream) throw new NotFoundException("Stream not found");

    const allStreams = await this.streamRepo.findByCanonicalChannelId(stream.canonicalChannelId);
    for (const s of allStreams) {
      if (s.isPrimary) {
        await this.streamRepo.update(s.id, { isPrimary: false });
      }
    }

    const updated = await this.streamRepo.update(streamId, { isPrimary: true });
    if (!updated) throw new NotFoundException("Stream not found");

    await this.canonicalRepo.update(stream.canonicalChannelId, { primaryStreamId: streamId });

    return updated;
  }
}
