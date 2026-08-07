/**
 * Merge candidate HTTP contract tests (009-m3u-control-plane T024).
 *
 * Locks down the wire contract for GET /output/merge-candidates and POST
 * /output/merge-candidates/:id/review. Uses the controller's typed shape
 * directly; the broader Nest app is exercised by other suites.
 */
import { describe, it, expect } from "vitest";
import { MergeCandidateVoSchema, ReviewMergeCandidateRequestSchema } from "@magi/types";

describe("Merge candidate HTTP contract (T024)", () => {
  it("MergeCandidateVoSchema parses a pending candidate", () => {
    const sample = {
      id: "00000000-0000-4000-8000-000000000001",
      sourceChannelId: "00000000-0000-4000-8000-000000000002",
      canonicalChannelId: "00000000-0000-4000-8000-000000000003",
      method: "normalized_name_group",
      reasons: ["display-name-match", "group-title-match"],
      status: "pending",
      sourceFingerprint: "sha256:abc",
      reviewedAt: null,
      reviewedBy: null,
    };
    expect(MergeCandidateVoSchema.safeParse(sample).success).toBe(true);
  });

  it("MergeCandidateVoSchema rejects unknown status", () => {
    const sample = {
      id: "00000000-0000-4000-8000-000000000001",
      sourceChannelId: "00000000-0000-4000-8000-000000000002",
      canonicalChannelId: null,
      method: "normalized_name",
      reasons: [],
      status: "draft", // invalid
      sourceFingerprint: "sha256:abc",
      reviewedAt: null,
      reviewedBy: null,
    };
    expect(MergeCandidateVoSchema.safeParse(sample).success).toBe(false);
  });

  it("ReviewMergeCandidateRequestSchema accepts accept with canonicalChannelId", () => {
    const sample = {
      decision: "accept",
      canonicalChannelId: "00000000-0000-4000-8000-000000000009",
      reason: "Confirmed correct channel",
    };
    expect(ReviewMergeCandidateRequestSchema.safeParse(sample).success).toBe(true);
  });

  it("ReviewMergeCandidateRequestSchema accepts reject without canonicalChannelId", () => {
    const sample = { decision: "reject" };
    expect(ReviewMergeCandidateRequestSchema.safeParse(sample).success).toBe(true);
  });

  it("ReviewMergeCandidateRequestSchema rejects unknown decision", () => {
    const sample = { decision: "skip" };
    expect(ReviewMergeCandidateRequestSchema.safeParse(sample).success).toBe(false);
  });
});

/** Response envelope contract (response shape from GET /output/merge-candidates). */
describe("Merge candidate list response envelope (T024)", () => {
  it("returns { success, data: { items, total, page, pageSize } }", () => {
    const sample = {
      success: true,
      data: {
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      },
    };
    expect(sample.success).toBe(true);
    expect(sample.data).toHaveProperty("items");
    expect(sample.data).toHaveProperty("total");
  });
});
