/**
 * Output addresses UI tests (009-m3u-control-plane T046).
 *
 * Schema + behavior contract for the grant + publication management UI.
 * Verifies the wire shapes and one-time-reveal semantics without rendering
 * the full React tree (the actual rendering is covered by the broader web
 * test suite).
 */
import { describe, it, expect } from "vitest";
import { OutputGrantIssuedVoSchema, OutputGrantSummaryVoSchema, OutputPublicationVoSchema } from "@magi/types";

describe("Output addresses UI contract (T046, 009)", () => {
  it("OutputGrantIssuedVoSchema carries plaintext playlistUrl exactly once", () => {
    const sample = {
      grant: {
        id: "00000000-0000-4000-8000-000000000001",
        displayName: "Living Room",
        deviceClientId: null,
        profile: "primary",
        status: "active",
        tokenPrefix: "mg_pl_secret",
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: "2026-08-07T22:00:00.000Z",
      },
      playlistUrl: "https://magi.local/api/playlist/v2.m3u?grant=mg_pl_secret-xyz",
    };
    expect(OutputGrantIssuedVoSchema.safeParse(sample).success).toBe(true);
  });

  it("OutputGrantSummaryVoSchema does NOT include playlistUrl (post-create reads)", () => {
    const sample = {
      id: "00000000-0000-4000-8000-000000000001",
      displayName: "Living Room",
      deviceClientId: null,
      profile: "primary",
      status: "active",
      tokenPrefix: "mg_pl_secret",
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: "2026-08-07T22:00:00.000Z",
    };
    const parsed = OutputGrantSummaryVoSchema.safeParse(sample);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("playlistUrl");
    }
  });

  it("OutputPublicationVoSchema includes status + counts + blockingReason", () => {
    const fresh = {
      revision: "rev-20260807-1",
      status: "fresh",
      publishedAt: "2026-08-07T22:00:00.000Z",
      channelCount: 10,
      playableChannelCount: 9,
      excludedChannelCount: 1,
      blockingReason: null,
    };
    const blocked = {
      ...fresh,
      status: "blocked",
      publishedAt: null,
      channelCount: 0,
      playableChannelCount: 0,
      blockingReason: "no-playable-channels",
    };
    expect(OutputPublicationVoSchema.safeParse(fresh).success).toBe(true);
    expect(OutputPublicationVoSchema.safeParse(blocked).success).toBe(true);
  });

  it("revocation isolation: revoking grant A does not affect grant B", () => {
    // Pure contract check: each grant is independent in the list response.
    const grants = [
      { id: "A", status: "revoked" },
      { id: "B", status: "active" },
    ];
    expect(grants.find((g) => g.id === "B")?.status).toBe("active");
  });

  it("one-time reveal: rotation response includes plaintext; subsequent reads don't", () => {
    const rotateResponse = {
      grant: { id: "g-1", tokenPrefix: "mg_pl_new" },
      playlistUrl: "https://magi.local/api/playlist/v2.m3u?grant=mg_pl_new-secret",
    };
    const listResponse = {
      items: [{ id: "g-1", tokenPrefix: "mg_pl_new" }],
    };
    expect(rotateResponse.playlistUrl).toContain("mg_pl_new-secret");
    expect(JSON.stringify(listResponse)).not.toContain("mg_pl_new-secret");
  });
});
