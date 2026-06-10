import { describe, it, expect } from "vitest";
import type { IM3uSourceRepository, M3uSource, IXmltvSourceRepository, XmltvSource, ISourceDownloader } from "@/domain/source-management";
import type { IRawM3uChannelRepository, IChannelRepository, IRawXmltvChannelRepository, IProgrammeRepository, IM3uParser, IXmltvParser } from "@/domain/channel-catalog";
import { SyncM3uSourceUseCase } from "../sync-m3u-source.use-case";
import { SyncXmltvSourceUseCase } from "../sync-xmltv-source.use-case";

function createM3uSource(overrides: Partial<M3uSource> = {}): M3uSource {
  return {
    id: "src-1",
    name: "Test M3U",
    url: "https://example.com/m3u",
    headers: null,
    enabled: true,
    role: "primary",
    priority: 100,
    participateInOutput: true,
    allowFallback: true,
    failureCount: 0,
    lastSuccessAt: null,
    qualityScore: null,
    lastSyncAt: null,
    lastSyncStatus: null,
    lastCheckAt: null,
    checkStatus: null,
    checkResponseTime: null,
    checkError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    type: "m3u",
    ...overrides,
  };
}

function createXmltvSource(overrides: Partial<XmltvSource> = {}): XmltvSource {
  return {
    id: "src-2",
    name: "Test XMLTV",
    url: "https://example.com/xmltv",
    headers: null,
    enabled: true,
    role: "primary",
    priority: 100,
    participateInOutput: true,
    failureCount: 0,
    lastSuccessAt: null,
    qualityScore: null,
    lastSyncAt: null,
    lastSyncStatus: null,
    lastCheckAt: null,
    checkStatus: null,
    checkResponseTime: null,
    checkError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    type: "xmltv",
    ...overrides,
  };
}

describe("SyncM3uSourceUseCase", () => {
  it("returns failed when source not found", async () => {
    const useCase = new SyncM3uSourceUseCase(
      { findById: async () => null, updateSyncStatus: async () => {} } as Partial<IM3uSourceRepository> as IM3uSourceRepository,
      {} as IRawM3uChannelRepository,
      {} as IChannelRepository,
      {} as ISourceDownloader,
      {} as IM3uParser,
    );
    const result = await useCase.execute("missing");
    expect(result.status).toBe("failed");
    expect(result.error).toContain("not found");
  });

  it("returns failed when source is disabled", async () => {
    const useCase = new SyncM3uSourceUseCase(
      { findById: async () => createM3uSource({ enabled: false }), updateSyncStatus: async () => {} } as Partial<IM3uSourceRepository> as IM3uSourceRepository,
      {} as IRawM3uChannelRepository,
      {} as IChannelRepository,
      {} as ISourceDownloader,
      {} as IM3uParser,
    );
    const result = await useCase.execute("src-1");
    expect(result.status).toBe("failed");
  });

  it("returns failed when download fails", async () => {
    const useCase = new SyncM3uSourceUseCase(
      { findById: async () => createM3uSource({ url: "https://invalid.test/fail" }), updateSyncStatus: async () => {} } as Partial<IM3uSourceRepository> as IM3uSourceRepository,
      { updateDisappearedFlag: async () => 0, createBatch: async () => [] } as Partial<IRawM3uChannelRepository> as IRawM3uChannelRepository,
      {} as IChannelRepository,
      { download: async () => ({ content: "", statusCode: 500 }) } as ISourceDownloader,
      {} as IM3uParser,
    );
    const result = await useCase.execute("src-1");
    expect(result.status).toBe("failed");
    expect(result.error).toBeTruthy();
  });
});

describe("SyncXmltvSourceUseCase", () => {
  it("returns failed when source not found", async () => {
    const useCase = new SyncXmltvSourceUseCase(
      { findById: async () => null, updateSyncStatus: async () => {} } as Partial<IXmltvSourceRepository> as IXmltvSourceRepository,
      {} as IRawXmltvChannelRepository,
      {} as IProgrammeRepository,
      {} as ISourceDownloader,
      {} as IXmltvParser,
    );
    const result = await useCase.execute("missing");
    expect(result.status).toBe("failed");
  });

  it("returns failed when source is disabled", async () => {
    const useCase = new SyncXmltvSourceUseCase(
      { findById: async () => createXmltvSource({ enabled: false }), updateSyncStatus: async () => {} } as Partial<IXmltvSourceRepository> as IXmltvSourceRepository,
      {} as IRawXmltvChannelRepository,
      {} as IProgrammeRepository,
      {} as ISourceDownloader,
      {} as IXmltvParser,
    );
    const result = await useCase.execute("src-2");
    expect(result.status).toBe("failed");
  });

  it("returns failed when download fails", async () => {
    const useCase = new SyncXmltvSourceUseCase(
      { findById: async () => createXmltvSource({ url: "https://invalid.test/fail" }), updateSyncStatus: async () => {} } as Partial<IXmltvSourceRepository> as IXmltvSourceRepository,
      {} as IRawXmltvChannelRepository,
      {} as IProgrammeRepository,
      { download: async () => ({ content: "", statusCode: 500 }) } as ISourceDownloader,
      {} as IXmltvParser,
    );
    const result = await useCase.execute("src-2");
    expect(result.status).toBe("failed");
  });
});
