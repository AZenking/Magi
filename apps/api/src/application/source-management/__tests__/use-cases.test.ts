import { describe, it, expect } from "vitest";
import type { IM3uSourceRepository, IXmltvSourceRepository, M3uSource, XmltvSource, FindSourcesParams } from "../../../domain/source-management";
import { FindSourcesUseCase } from "../find-sources.use-case";
import { FindSourceUseCase } from "../find-source.use-case";
import { CreateSourceUseCase } from "../create-source.use-case";
import { UpdateSourceUseCase } from "../update-source.use-case";
import { DeleteSourceUseCase } from "../delete-source.use-case";
import { NotFoundException } from "@nestjs/common";

function createM3uSource(overrides: Partial<M3uSource> = {}): M3uSource {
  return {
    id: "m3u-1",
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
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    type: "m3u",
    ...overrides,
  };
}

function createXmltvSource(overrides: Partial<XmltvSource> = {}): XmltvSource {
  return {
    id: "xmltv-1",
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
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    type: "xmltv",
    ...overrides,
  };
}

function createMockM3uRepo(overrides: Partial<IM3uSourceRepository> = {}): IM3uSourceRepository {
  return {
    findAll: async () => [],
    findById: async () => null,
    findPaginated: async () => ({ items: [], total: 0 }),
    create: async () => createM3uSource(),
    update: async () => null,
    delete: async () => false,
    updateSyncStatus: async () => {},
    updateIfVersion: async () => null,
    ...overrides,
  };
}

function createMockXmltvRepo(overrides: Partial<IXmltvSourceRepository> = {}): IXmltvSourceRepository {
  return {
    findAll: async () => [],
    findById: async () => null,
    findPaginated: async () => ({ items: [], total: 0 }),
    create: async () => createXmltvSource(),
    update: async () => null,
    delete: async () => false,
    updateSyncStatus: async () => {},
    clearProgrammeBindings: async () => {},
    updateIfVersion: async () => null,
    ...overrides,
  };
}

describe("FindSourcesUseCase", () => {
  const defaultParams: FindSourcesParams = {
    page: 1,
    pageSize: 20,
    sortBy: "createdAt",
    sortDir: "desc",
  };

  it("returns m3u sources when type is m3u", async () => {
    const m3uSource = createM3uSource();
    const useCase = new FindSourcesUseCase(
      createMockM3uRepo({ findPaginated: async () => ({ items: [m3uSource], total: 1 }) }),
      createMockXmltvRepo(),
    );

    const result = await useCase.execute("m3u", defaultParams);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.type).toBe("m3u");
    expect(result.total).toBe(1);
  });

  it("returns xmltv sources when type is xmltv", async () => {
    const xmltvSource = createXmltvSource();
    const useCase = new FindSourcesUseCase(
      createMockM3uRepo(),
      createMockXmltvRepo({ findPaginated: async () => ({ items: [xmltvSource], total: 1 }) }),
    );

    const result = await useCase.execute("xmltv", defaultParams);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.type).toBe("xmltv");
  });

  it("returns combined sources when type is undefined", async () => {
    const useCase = new FindSourcesUseCase(
      createMockM3uRepo({ findPaginated: async () => ({ items: [createM3uSource()], total: 1 }) }),
      createMockXmltvRepo({ findPaginated: async () => ({ items: [createXmltvSource()], total: 1 }) }),
    );

    const result = await useCase.execute(undefined, defaultParams);
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});

describe("FindSourceUseCase", () => {
  it("returns m3u source by id", async () => {
    const m3uSource = createM3uSource();
    const useCase = new FindSourceUseCase(
      createMockM3uRepo({ findById: async () => m3uSource }),
      createMockXmltvRepo(),
    );

    const result = await useCase.execute("m3u-1", "m3u");
    expect(result.id).toBe("m3u-1");
    expect(result.type).toBe("m3u");
  });

  it("throws NotFoundException for missing m3u source", async () => {
    const useCase = new FindSourceUseCase(
      createMockM3uRepo({ findById: async () => null }),
      createMockXmltvRepo(),
    );

    await expect(useCase.execute("missing", "m3u")).rejects.toThrow(NotFoundException);
  });

  it("returns xmltv source by id", async () => {
    const xmltvSource = createXmltvSource();
    const useCase = new FindSourceUseCase(
      createMockM3uRepo(),
      createMockXmltvRepo({ findById: async () => xmltvSource }),
    );

    const result = await useCase.execute("xmltv-1", "xmltv");
    expect(result.id).toBe("xmltv-1");
    expect(result.type).toBe("xmltv");
  });

  it("throws NotFoundException for missing xmltv source", async () => {
    const useCase = new FindSourceUseCase(
      createMockM3uRepo(),
      createMockXmltvRepo({ findById: async () => null }),
    );

    await expect(useCase.execute("missing", "xmltv")).rejects.toThrow(NotFoundException);
  });
});

describe("CreateSourceUseCase", () => {
  it("creates m3u source", async () => {
    const m3uSource = createM3uSource();
    const useCase = new CreateSourceUseCase(
      createMockM3uRepo({ create: async () => m3uSource }),
      createMockXmltvRepo(),
    );

    const result = await useCase.execute({
      name: "Test M3U",
      type: "m3u",
      url: "https://example.com/m3u",
      enabled: true,
      role: "primary",
      priority: 100,
      participateInOutput: true,
      allowFallback: true,
    });

    expect(result.type).toBe("m3u");
    expect(result.name).toBe("Test M3U");
  });

  it("creates xmltv source", async () => {
    const xmltvSource = createXmltvSource();
    const useCase = new CreateSourceUseCase(
      createMockM3uRepo(),
      createMockXmltvRepo({ create: async () => xmltvSource }),
    );

    const result = await useCase.execute({
      name: "Test XMLTV",
      type: "xmltv",
      url: "https://example.com/xmltv",
      enabled: true,
      role: "primary",
      priority: 100,
      participateInOutput: true,
      allowFallback: true,
    });

    expect(result.type).toBe("xmltv");
    expect(result.name).toBe("Test XMLTV");
  });
});

describe("UpdateSourceUseCase", () => {
  it("updates m3u source", async () => {
    const updated = createM3uSource({ name: "Updated" });
    const useCase = new UpdateSourceUseCase(
      createMockM3uRepo({ update: async () => updated }),
      createMockXmltvRepo(),
    );

    const result = await useCase.execute("m3u-1", "m3u", { name: "Updated" });
    expect(result.name).toBe("Updated");
  });

  it("throws when m3u source not found", async () => {
    const useCase = new UpdateSourceUseCase(
      createMockM3uRepo({ update: async () => null }),
      createMockXmltvRepo(),
    );

    await expect(useCase.execute("missing", "m3u", { name: "X" })).rejects.toThrow(NotFoundException);
  });
});

describe("DeleteSourceUseCase", () => {
  it("deletes m3u source", async () => {
    const useCase = new DeleteSourceUseCase(
      createMockM3uRepo({ delete: async () => true }),
      createMockXmltvRepo(),
    );

    await expect(useCase.execute("m3u-1", "m3u")).resolves.toBeUndefined();
  });

  it("clears programmes before deleting xmltv source", async () => {
    let programmesCleared = false;
    const useCase = new DeleteSourceUseCase(
      createMockM3uRepo(),
      createMockXmltvRepo({
        clearProgrammeBindings: async () => { programmesCleared = true; },
        delete: async () => true,
      }),
    );

    await useCase.execute("xmltv-1", "xmltv");
    expect(programmesCleared).toBe(true);
  });

  it("throws when source not found", async () => {
    const useCase = new DeleteSourceUseCase(
      createMockM3uRepo({ delete: async () => false }),
      createMockXmltvRepo(),
    );

    await expect(useCase.execute("missing", "m3u")).rejects.toThrow(NotFoundException);
  });
});
