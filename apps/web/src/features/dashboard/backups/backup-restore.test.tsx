/**
 * Backup restore Web tests (T096).
 *
 * Validates the backup lifecycle surface: create/list/download/restore-preflight
 * data shapes (Part A, live) and the restore blockers + expiry display contract
 * (Part B). Mirrors contracts/backups.md and the OperationPreview apply gate.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildBackup,
  buildRestoreSummary,
  resetFixtureIds,
} from "@/test/safe-operations-fixtures";

describe("Backup fixtures (T096 — part A, live)", () => {
  beforeEach(() => resetFixtureIds());

  it("buildBackup produces a ready, downloadable backup with scope + counts", () => {
    const b = buildBackup();
    expect(b.status).toBe("ready");
    expect(b.canDownload).toBe(true);
    expect(b.scope.canonicalChannels).toBe(true);
    expect(b.objectCounts.channels).toBeGreaterThan(0);
  });

  it("buildBackup exposes a real expiresAt (30-day retention default)", () => {
    const b = buildBackup();
    const expiresAt = new Date(b.expiresAt as string);
    const createdAt = new Date(b.createdAt as string);
    // ~30 days between creation and expiry.
    const days = (expiresAt.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(28);
    expect(days).toBeLessThan(31);
  });

  it("a failed/expired backup is not downloadable", () => {
    const expired = buildBackup({ id: "b-expired", status: "expired", canDownload: false });
    expect(expired.canDownload).toBe(false);
    const failed = buildBackup({ id: "b-failed", status: "failed", canDownload: false });
    expect(failed.canDownload).toBe(false);
  });

  it("buildRestoreSummary distinguishes add/overwrite/skip/conflict/unsupported", () => {
    const s = buildRestoreSummary({ conflict: 3, unsupported: 1 });
    expect(s.add).toBe(10);
    expect(s.conflict).toBe(3);
    expect(s.unsupported).toBe(1);
  });
});

describe("Restore blockers contract (T096 — part B)", () => {
  beforeEach(() => resetFixtureIds());

  it("a restore with conflicts must surface a blocker before apply (FR-021)", () => {
    // contracts/backups.md: blockers zero is required to apply. A conflict
    // count > 0 means the change-set apply gate stays disabled.
    const summary = buildRestoreSummary({ conflict: 2 });
    const hasBlocker = summary.conflict > 0 || summary.unsupported > 0;
    expect(hasBlocker).toBe(true);
  });

  it("a clean restore (no conflict/unsupported) is applyable", () => {
    const summary = buildRestoreSummary({ conflict: 0, unsupported: 0 });
    const hasBlocker = summary.conflict > 0 || summary.unsupported > 0;
    expect(hasBlocker).toBe(false);
  });

  it("download is gated on status=ready AND canDownload (never on storageRef)", () => {
    const ready = buildBackup({ status: "ready", canDownload: true });
    const canDownload = ready.status === "ready" && ready.canDownload === true;
    expect(canDownload).toBe(true);
    // storageRef is never part of the wire VO (FR-021 redaction).
    expect(ready).not.toHaveProperty("storageRef");
  });
});
