/**
 * Regression test for the "输出频道绑定 EPG 无效" bug.
 *
 * Symptom: operator binds an EPG channel via
 * `PATCH /output/channels/:id/epg-binding` without checking "锁定人工绑定".
 * The next M3U/XMLTV sync calls `reconcileCanonicals`, which silently
 * overwrites the manual binding with the auto-match result via
 * `onConflictDoUpdate`, so the operator sees their freshly-bound EPG
 * disappear.
 *
 * Root cause: `reconcileCanonicals` only preserved `locked === true` bindings.
 * Fix: also preserve any `matched_manual` binding regardless of the lock flag.
 */
import { describe, expect, it } from "vitest";
import { shouldPreserveEpgBinding } from "../reconcile-canonicals";

describe("shouldPreserveEpgBinding", () => {
  it("preserves a locked binding", () => {
    expect(
      shouldPreserveEpgBinding({ locked: true, status: "matched_auto" }),
    ).toBe(true);
  });

  it("preserves an unlocked manual binding (regression)", () => {
    expect(
      shouldPreserveEpgBinding({ locked: false, status: "matched_manual" }),
    ).toBe(true);
  });

  it("does not preserve an unlocked auto binding (auto-match may refine it)", () => {
    expect(
      shouldPreserveEpgBinding({ locked: false, status: "matched_auto" }),
    ).toBe(false);
  });

  it("does not preserve an unmatched binding (let auto-match try again)", () => {
    expect(
      shouldPreserveEpgBinding({ locked: false, status: "unmatched" }),
    ).toBe(false);
  });

  it("does not preserve a conflict binding", () => {
    expect(
      shouldPreserveEpgBinding({ locked: false, status: "conflict" }),
    ).toBe(false);
  });

  it("treats absent binding as not preservable", () => {
    expect(shouldPreserveEpgBinding(undefined)).toBe(false);
    expect(shouldPreserveEpgBinding(null)).toBe(false);
  });
});
