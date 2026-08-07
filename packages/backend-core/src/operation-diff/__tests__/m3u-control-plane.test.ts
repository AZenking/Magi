/**
 * Unit tests for the M3U control-plane pure helpers (T005).
 *
 * Verifies the four pure building blocks before the Worker/API consume them:
 *   - normalizeTvgId / normalizeName
 *   - classifyAnomaly (25% / empty / first-import)
 *   - groupByNormalizedTvgId + matchAutomaticMembership
 *   - generateWeakMatchCandidates + suppression key
 */
import { describe, it, expect } from "vitest";
import {
  DELETION_RATIO_THRESHOLD,
  buildCandidateSuppressionKey,
  classifyAnomaly,
  generateWeakMatchCandidates,
  groupByNormalizedTvgId,
  matchAutomaticMembership,
  normalizeName,
  normalizeTvgId,
} from "../m3u-control-plane";

describe("normalizeTvgId", () => {
  it("returns null for empty / whitespace-only input", () => {
    expect(normalizeTvgId(null)).toBeNull();
    expect(normalizeTvgId("")).toBeNull();
    expect(normalizeTvgId("   ")).toBeNull();
  });

  it("lowercases, trims, collapses whitespace and strips diacritics", () => {
    expect(normalizeTvgId("  CCTV-1  ")).toBe("cctv-1");
    expect(normalizeTvgId("CCTV  1")).toBe("cctv 1");
    expect(normalizeTvgId("CCTV-é")).toBe("cctv-e");
  });

  it("treats full-width and Unicode whitespace as separators", () => {
    expect(normalizeTvgId("CCTV　1")).toBe("cctv 1");
  });
});

describe("normalizeName", () => {
  it("collapses hyphens and underscores to spaces", () => {
    expect(normalizeName("CCTV-1_HD")).toBe("cctv 1 hd");
  });
  it("returns null when input is empty", () => {
    expect(normalizeName("")).toBeNull();
    expect(normalizeName(null)).toBeNull();
  });
});

describe("classifyAnomaly", () => {
  it("never flags first import (currentPresent == 0)", () => {
    const result = classifyAnomaly({
      snapshotItemCount: 0,
      currentPresentCount: 0,
      missingCount: 0,
    });
    expect(result.requiresConfirmation).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("flags empty snapshot against non-empty baseline", () => {
    const result = classifyAnomaly({
      snapshotItemCount: 0,
      currentPresentCount: 10,
      missingCount: 10,
    });
    expect(result.requiresConfirmation).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain("empty-snapshot");
    expect(result.warnings.map((w) => w.code)).toContain("deletion-ratio-exceeded");
  });

  it("flags when deletion ratio ≥ 0.25", () => {
    const result = classifyAnomaly({
      snapshotItemCount: 3,
      currentPresentCount: 4,
      missingCount: 1,
    });
    expect(result.requiresConfirmation).toBe(true);
    expect(result.warnings[0].deletionRatio).toBe(0.25);
  });

  it("does not flag when deletion ratio < 0.25", () => {
    const result = classifyAnomaly({
      snapshotItemCount: 8,
      currentPresentCount: 10,
      missingCount: 2,
    });
    expect(result.requiresConfirmation).toBe(false);
  });

  it("uses the constant threshold", () => {
    expect(DELETION_RATIO_THRESHOLD).toBe(0.25);
  });
});

describe("groupByNormalizedTvgId", () => {
  it("groups same normalized tvg-id together", () => {
    const sources = [
      {
        sourceChannelId: "s1",
        channelIdentity: "cctv-1@primary",
        tvgId: "CCTV-1",
        tvgName: "CCTV-1",
        displayName: "CCTV-1 综合",
        groupTitle: "综合",
        sourceFingerprint: "fp-a",
      },
      {
        sourceChannelId: "s2",
        channelIdentity: "cctv-1@backup",
        tvgId: "cctv-1",
        tvgName: "CCTV-1 HD",
        displayName: "CCTV-1 综合 HD",
        groupTitle: "综合",
        sourceFingerprint: "fp-b",
      },
    ];
    const groups = groupByNormalizedTvgId(sources);
    expect(groups.size).toBe(1);
    expect(Array.from(groups.keys())).toEqual(["cctv-1"]);
    expect(groups.get("cctv-1")?.length).toBe(2);
  });

  it("excludes sources with empty tvg-id", () => {
    const sources = [
      {
        sourceChannelId: "s1",
        channelIdentity: "phoenix-a",
        tvgId: null,
        tvgName: null,
        displayName: "凤凰资讯",
        groupTitle: "资讯",
        sourceFingerprint: "fp-a",
      },
    ];
    expect(groupByNormalizedTvgId(sources).size).toBe(0);
  });
});

describe("matchAutomaticMembership", () => {
  const source = {
    sourceChannelId: "s1",
    channelIdentity: "cctv-1",
    tvgId: "CCTV-1",
    tvgName: "CCTV-1",
    displayName: "CCTV-1 综合",
    groupTitle: "综合",
    sourceFingerprint: "fp",
  };

  it("returns no-tvg-id when source has no tvg-id", () => {
    const result = matchAutomaticMembership({
      source: { ...source, tvgId: null },
      canonicals: [],
    });
    expect(result.reason).toBe("no-tvg-id");
    expect(result.normalizedTvgId).toBeNull();
  });

  it("matches when source is already a member", () => {
    const canonicals = [
      {
        canonicalChannelId: "c1",
        memberSourceChannelIds: new Set(["s1"]),
      },
    ];
    const result = matchAutomaticMembership({ source, canonicals });
    expect(result.reason).toBe("tvg-id-collision");
    expect(result.matchedCanonicalId).toBe("c1");
    expect(result.normalizedTvgId).toBe("cctv-1");
  });

  it("returns no-match when source is not yet a member", () => {
    const result = matchAutomaticMembership({
      source,
      canonicals: [
        {
          canonicalChannelId: "c1",
          memberSourceChannelIds: new Set(["s-other"]),
        },
      ],
    });
    expect(result.reason).toBe("no-match");
    expect(result.normalizedTvgId).toBe("cctv-1");
  });
});

describe("generateWeakMatchCandidates", () => {
  const canonicals = [
    {
      canonicalChannelId: "c1",
      memberSourceChannelIds: new Set<string>(),
      normalizedName: "凤凰资讯",
      normalizedGroup: "资讯",
    },
  ];

  it("produces normalized_name_group when name+group match", () => {
    const unmatched = [
      {
        sourceChannelId: "s2",
        channelIdentity: "phoenix-b",
        tvgId: null,
        tvgName: null,
        displayName: "凤凰资讯",
        groupTitle: "资讯",
        sourceFingerprint: "fp",
      },
    ];
    const candidates = generateWeakMatchCandidates({
      unmatchedSources: unmatched,
      canonicals,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].method).toBe("normalized_name_group");
    expect(candidates[0].confidence).toBeGreaterThan(0.5);
  });

  it("downgrades to normalized_name when only name matches", () => {
    const unmatched = [
      {
        sourceChannelId: "s3",
        channelIdentity: "phoenix-c",
        tvgId: null,
        tvgName: null,
        displayName: "凤凰资讯",
        groupTitle: "Other",
        sourceFingerprint: "fp",
      },
    ];
    const candidates = generateWeakMatchCandidates({
      unmatchedSources: unmatched,
      canonicals,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].method).toBe("normalized_name");
  });

  it("suppresses candidates where source is already a member", () => {
    const candidates = generateWeakMatchCandidates({
      unmatchedSources: [
        {
          sourceChannelId: "s-existing",
          channelIdentity: "phoenix-x",
          tvgId: null,
          tvgName: null,
          displayName: "凤凰资讯",
          groupTitle: "资讯",
          sourceFingerprint: "fp",
        },
      ],
      canonicals: [
        {
          ...canonicals[0],
          memberSourceChannelIds: new Set(["s-existing"]),
        },
      ],
    });
    expect(candidates).toHaveLength(0);
  });
});

describe("buildCandidateSuppressionKey", () => {
  it("joins the four components into a stable key", () => {
    const key = buildCandidateSuppressionKey({
      sourceFingerprint: "fp-a",
      sourceChannelId: "s1",
      canonicalChannelId: "c1",
      method: "normalized_name",
    });
    expect(key).toBe("fp-a|s1|c1|normalized_name");
  });
});
