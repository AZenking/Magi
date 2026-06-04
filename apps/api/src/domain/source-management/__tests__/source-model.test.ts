import { describe, it, expect } from "vitest";
import { SourceModel, M3uSourceModel, XmltvSourceModel } from "../source-model";
import type { M3uSource, XmltvSource } from "../source.model";

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

describe("SourceModel", () => {
  describe("canBeSynced", () => {
    it("returns true when enabled and has url", () => {
      const model = new SourceModel(createM3uSource());
      expect(model.canBeSynced()).toBe(true);
    });

    it("returns false when disabled", () => {
      const model = new SourceModel(createM3uSource({ enabled: false }));
      expect(model.canBeSynced()).toBe(false);
    });

    it("returns false when url is empty", () => {
      const model = new SourceModel(createM3uSource({ url: "" }));
      expect(model.canBeSynced()).toBe(false);
    });
  });

  describe("isStale", () => {
    it("returns true when never synced", () => {
      const model = new SourceModel(createM3uSource());
      expect(model.isStale(60000)).toBe(true);
    });

    it("returns true when synced beyond max age", () => {
      const oldDate = new Date(Date.now() - 120000);
      const model = new SourceModel(createM3uSource({ lastSyncAt: oldDate }));
      expect(model.isStale(60000)).toBe(true);
    });

    it("returns false when synced within max age", () => {
      const recentDate = new Date(Date.now() - 30000);
      const model = new SourceModel(createM3uSource({ lastSyncAt: recentDate }));
      expect(model.isStale(60000)).toBe(false);
    });
  });

  describe("isHealthy", () => {
    it("returns true for enabled source with no failures", () => {
      const model = new SourceModel(createM3uSource());
      expect(model.isHealthy()).toBe(true);
    });

    it("returns false when disabled", () => {
      const model = new SourceModel(createM3uSource({ enabled: false }));
      expect(model.isHealthy()).toBe(false);
    });

    it("returns false when failure count exceeds 5", () => {
      const model = new SourceModel(createM3uSource({ failureCount: 6 }));
      expect(model.isHealthy()).toBe(false);
    });

    it("returns false when last sync failed", () => {
      const model = new SourceModel(createM3uSource({ lastSyncStatus: "failed" }));
      expect(model.isHealthy()).toBe(false);
    });
  });

  describe("shouldParticipateInOutput", () => {
    it("returns true when enabled and participateInOutput", () => {
      const model = new SourceModel(createM3uSource());
      expect(model.shouldParticipateInOutput()).toBe(true);
    });

    it("returns false when disabled", () => {
      const model = new SourceModel(createM3uSource({ enabled: false }));
      expect(model.shouldParticipateInOutput()).toBe(false);
    });

    it("returns false when participateInOutput is false", () => {
      const model = new SourceModel(createM3uSource({ participateInOutput: false }));
      expect(model.shouldParticipateInOutput()).toBe(false);
    });
  });

  describe("isPrimary", () => {
    it("returns true for primary role", () => {
      const model = new SourceModel(createM3uSource({ role: "primary" }));
      expect(model.isPrimary()).toBe(true);
    });

    it("returns false for backup role", () => {
      const model = new SourceModel(createM3uSource({ role: "backup" }));
      expect(model.isPrimary()).toBe(false);
    });
  });

  describe("toObject", () => {
    it("returns a copy of the source", () => {
      const source = createM3uSource();
      const model = new SourceModel(source);
      const obj = model.toObject();
      expect(obj).toEqual(source);
      expect(obj).not.toBe(source);
    });
  });
});

describe("M3uSourceModel", () => {
  it("returns type m3u", () => {
    const model = new M3uSourceModel(createM3uSource());
    expect(model.type).toBe("m3u");
  });
});

describe("XmltvSourceModel", () => {
  it("returns type xmltv", () => {
    const model = new XmltvSourceModel(createXmltvSource());
    expect(model.type).toBe("xmltv");
  });
});
