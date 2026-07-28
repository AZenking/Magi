/**
 * Channel lifecycle domain tests (T049).
 *
 * Validates the lifecycle state machine (data-model.md CanonicalChannel),
 * purge preconditions (FR-016) and sourcePresence orthogonality (FR-014).
 * Pure unit tests — no DB, no framework.
 */
import { describe, it, expect } from "vitest";
import { canTransition } from "@magi/types";
import { CanonicalChannelModel, type CanonicalChannel } from "../canonical-channel.model";

function channel(overrides: Partial<CanonicalChannel> = {}): CanonicalChannel {
  return {
    id: "cc-1",
    standardName: "CCTV-1",
    standardGroup: null,
    standardLogo: null,
    channelNumber: null,
    hidden: false,
    starred: false,
    disabled: false,
    epgChannelId: null,
    epgMatchType: null,
    epgStatus: null,
    outputStatus: "active",
    qualityScore: null,
    primaryStreamId: null,
    mergedFromIds: null,
    mergeMethod: null,
    conflictNote: null,
    lastMergedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CanonicalChannel;
}

describe("lifecycle state machine (T049)", () => {
  it("active ↔ hidden is reversible", () => {
    expect(canTransition("active", "hidden")).toBe(true);
    expect(canTransition("hidden", "active")).toBe(true);
  });

  it("active ↔ disabled is reversible", () => {
    expect(canTransition("active", "disabled")).toBe(true);
    expect(canTransition("disabled", "active")).toBe(true);
  });

  it("hidden ↔ disabled is reversible", () => {
    expect(canTransition("hidden", "disabled")).toBe(true);
    expect(canTransition("disabled", "hidden")).toBe(true);
  });

  it("any non-trashed state can go to trashed", () => {
    expect(canTransition("active", "trashed")).toBe(true);
    expect(canTransition("hidden", "trashed")).toBe(true);
    expect(canTransition("disabled", "trashed")).toBe(true);
  });

  it("trashed can restore to any non-trashed state", () => {
    expect(canTransition("trashed", "active")).toBe(true);
    expect(canTransition("trashed", "hidden")).toBe(true);
    expect(canTransition("trashed", "disabled")).toBe(true);
  });

  it("trashed → trashed is not a transition (no-op)", () => {
    expect(canTransition("trashed", "trashed")).toBe(false);
  });

  it("illegal transitions are rejected", () => {
    // Purge is NOT a lifecycle transition — it is a separate operation.
    // Here we assert a self-transition is rejected (no-op not allowed).
    expect(canTransition("active", "active")).toBe(false);
    expect(canTransition("trashed", "trashed")).toBe(false);
  });
});

describe("lifecycleState derivation (T049)", () => {
  it("derives active from booleans when lifecycle is unset", () => {
    const m = new CanonicalChannelModel(channel({ hidden: false, disabled: false }));
    expect(m.lifecycleState()).toBe("active");
  });

  it("derives disabled when disabled=true and lifecycle unset", () => {
    const m = new CanonicalChannelModel(channel({ disabled: true }));
    expect(m.lifecycleState()).toBe("disabled");
  });

  it("derives hidden when hidden=true and disabled=false and lifecycle unset", () => {
    const m = new CanonicalChannelModel(channel({ hidden: true, disabled: false }));
    expect(m.lifecycleState()).toBe("hidden");
  });

  it("uses lifecycle column when set (ignores legacy booleans)", () => {
    const m = new CanonicalChannelModel(
      channel({ lifecycle: "trashed", hidden: false, disabled: false }),
    );
    expect(m.lifecycleState()).toBe("trashed");
  });
});

describe("purge preconditions (T049 / FR-016)", () => {
  it("canPurge is false for a non-trashed channel", () => {
    const m = new CanonicalChannelModel(channel({ lifecycle: "active" }));
    expect(m.canPurge()).toBe(false);
  });

  it("canPurge is false when purgeAfter is not set", () => {
    const m = new CanonicalChannelModel(channel({ lifecycle: "trashed", purgeAfter: null }));
    expect(m.canPurge()).toBe(false);
  });

  it("canPurge is false when purgeAfter is in the future", () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const m = new CanonicalChannelModel(channel({ lifecycle: "trashed", purgeAfter: future }));
    expect(m.canPurge()).toBe(false);
  });

  it("canPurge is true only when trashed AND purgeAfter has elapsed", () => {
    const past = new Date(Date.now() - 1000);
    const m = new CanonicalChannelModel(channel({ lifecycle: "trashed", purgeAfter: past }));
    expect(m.canPurge()).toBe(true);
  });
});

describe("sourcePresence orthogonality (T049 / FR-014)", () => {
  it("shouldBeInOutput respects lifecycle, not source presence", () => {
    // lifecycle=hidden → not in output even if source is present (conceptually).
    const m = new CanonicalChannelModel(channel({ lifecycle: "hidden" }));
    expect(m.shouldBeInOutput()).toBe(false);
  });

  it("shouldBeInOutput is true for active lifecycle", () => {
    const m = new CanonicalChannelModel(channel({ lifecycle: "active" }));
    expect(m.shouldBeInOutput()).toBe(true);
  });

  it("shouldBeInOutput is false for disabled and trashed", () => {
    expect(new CanonicalChannelModel(channel({ lifecycle: "disabled" })).shouldBeInOutput()).toBe(false);
    expect(new CanonicalChannelModel(channel({ lifecycle: "trashed" })).shouldBeInOutput()).toBe(false);
  });
});
