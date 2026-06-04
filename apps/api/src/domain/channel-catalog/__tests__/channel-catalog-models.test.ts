import { describe, it, expect } from "vitest";
import { ChannelModel, type Channel } from "../channel.model";
import { ProgrammeModel, type Programme } from "../programme.model";

function createChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: "ch-1",
    channelIdentity: "src::tvg-id::cctv1",
    m3uSourceId: "src-1",
    rawChannelId: "raw-1",
    displayName: "CCTV-1",
    groupTitle: "央视",
    tvgId: "cctv1",
    tvgLogo: "http://logo/1.png",
    streamUrl: "http://stream.example.com/cctv1",
    epgChannelId: null,
    epgMatchType: null,
    active: true,
    streamStatus: "unknown",
    streamResponseTime: null,
    streamCheckedAt: null,
    streamError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createProgramme(overrides: Partial<Programme> = {}): Programme {
  return {
    id: "prog-1",
    sourceId: "src-1",
    xmltvChannelId: "cctv1",
    title: "新闻",
    subTitle: null,
    desc: null,
    category: "新闻",
    startAt: new Date("2025-06-01T06:00:00Z"),
    stopAt: new Date("2025-06-01T07:00:00Z"),
    createdAt: new Date(),
    ...overrides,
  };
}

describe("ChannelModel", () => {
  describe("canBeDeleted", () => {
    it("returns false for active channel", () => {
      expect(new ChannelModel(createChannel({ active: true })).canBeDeleted()).toBe(false);
    });
    it("returns true for inactive channel", () => {
      expect(new ChannelModel(createChannel({ active: false })).canBeDeleted()).toBe(true);
    });
  });

  describe("isActive", () => {
    it("returns true for active", () => {
      expect(new ChannelModel(createChannel()).isActive()).toBe(true);
    });
  });

  describe("hasEpgBinding", () => {
    it("returns false when no epgChannelId", () => {
      expect(new ChannelModel(createChannel()).hasEpgBinding()).toBe(false);
    });
    it("returns true when epgChannelId is set", () => {
      expect(new ChannelModel(createChannel({ epgChannelId: "cctv1" })).hasEpgBinding()).toBe(true);
    });
  });

  describe("hasStream", () => {
    it("returns true when streamUrl exists", () => {
      expect(new ChannelModel(createChannel()).hasStream()).toBe(true);
    });
    it("returns false when streamUrl is null", () => {
      expect(new ChannelModel(createChannel({ streamUrl: null })).hasStream()).toBe(false);
    });
  });

  describe("toObject", () => {
    it("returns a copy", () => {
      const channel = createChannel();
      const obj = new ChannelModel(channel).toObject();
      expect(obj).toEqual(channel);
      expect(obj).not.toBe(channel);
    });
  });
});

describe("ProgrammeModel", () => {
  describe("conflictsWith", () => {
    it("detects overlapping programmes on same channel", () => {
      const p1 = createProgramme({
        startAt: new Date("2025-06-01T06:00:00Z"),
        stopAt: new Date("2025-06-01T07:00:00Z"),
      });
      const p2 = createProgramme({
        startAt: new Date("2025-06-01T06:30:00Z"),
        stopAt: new Date("2025-06-01T07:30:00Z"),
      });
      expect(new ProgrammeModel(p1).conflictsWith(p2)).toBe(true);
    });

    it("does not conflict for non-overlapping times", () => {
      const p1 = createProgramme({
        startAt: new Date("2025-06-01T06:00:00Z"),
        stopAt: new Date("2025-06-01T07:00:00Z"),
      });
      const p2 = createProgramme({
        startAt: new Date("2025-06-01T07:00:00Z"),
        stopAt: new Date("2025-06-01T08:00:00Z"),
      });
      expect(new ProgrammeModel(p1).conflictsWith(p2)).toBe(false);
    });

    it("does not conflict for different channels", () => {
      const p1 = createProgramme({ xmltvChannelId: "ch1" });
      const p2 = createProgramme({ xmltvChannelId: "ch2" });
      expect(new ProgrammeModel(p1).conflictsWith(p2)).toBe(false);
    });
  });

  describe("canBeOverwritten", () => {
    it("returns true for past programmes", () => {
      const p = createProgramme({
        stopAt: new Date("2020-01-01T07:00:00Z"),
      });
      expect(new ProgrammeModel(p).canBeOverwritten()).toBe(true);
    });

    it("returns false for future programmes", () => {
      const p = createProgramme({
        startAt: new Date("2099-06-01T06:00:00Z"),
        stopAt: new Date("2099-06-01T07:00:00Z"),
      });
      expect(new ProgrammeModel(p).canBeOverwritten()).toBe(false);
    });
  });

  describe("isOngoing", () => {
    it("returns true for currently airing programme", () => {
      const now = new Date();
      const p = createProgramme({
        startAt: new Date(now.getTime() - 1800000),
        stopAt: new Date(now.getTime() + 1800000),
      });
      expect(new ProgrammeModel(p).isOngoing()).toBe(true);
    });
  });
});
