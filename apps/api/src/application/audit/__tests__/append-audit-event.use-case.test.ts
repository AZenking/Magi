/**
 * AppendAuditEventUseCase (T050).
 *
 * Verifies that persisted audit summaries and operator reasons are redacted
 * (no token/secret/credential leakage), reason is truncated to 500 chars, and
 * optional fields default to null before being handed to the transactional
 * writer.
 */
import { describe, it, expect, vi } from "vitest";
import {
  AppendAuditEventUseCase,
  type AuditEventWriter,
} from "@/application/audit/append-audit-event.use-case";
import type { AuditEvent } from "@/domain/audit";

function makeWriter(): {
  writer: AuditEventWriter;
  append: ReturnType<typeof vi.fn>;
} {
  const append = vi.fn(async (data: Omit<AuditEvent, "id" | "occurredAt">) => {
    const event: AuditEvent = {
      ...data,
      id: "audit-1",
      occurredAt: new Date("2026-08-01T00:00:00Z"),
    };
    return event;
  });
  return { writer: { appendWithOutbox: append }, append };
}

describe("AppendAuditEventUseCase", () => {
  it("redacts secret-bearing summary keys before persisting", async () => {
    const { writer, append } = makeWriter();
    const useCase = new AppendAuditEventUseCase(writer);

    await useCase.execute({
      actorType: "user",
      actorId: "user-1",
      action: "device_client.revoked",
      targetType: "device_client",
      targetId: "device-1",
      result: "succeeded",
      summary: {
        refreshToken: "rt-secret-value",
        accessToken: "at-secret-value",
        secret: "should-not-leak",
        accessTokensRevoked: 3,
      },
    });

    const persisted = append.mock.calls[0]![0];
    expect(persisted.summary).toEqual({
      refreshToken: "[redacted]",
      accessToken: "[redacted]",
      secret: "[redacted]",
      accessTokensRevoked: 3,
    });
  });

  it("truncates the reason to 500 characters and redacts bearer tokens", async () => {
    const { writer, append } = makeWriter();
    const useCase = new AppendAuditEventUseCase(writer);
    const longBearer = `Bearer ${"a".repeat(600)}`;

    await useCase.execute({
      actorType: "user",
      actorId: "user-1",
      action: "device_client.auto_registered",
      targetType: "device_client",
      targetId: "device-2",
      result: "succeeded",
      reason: longBearer,
    });

    const persisted = append.mock.calls[0]![0];
    expect(persisted.reason?.length).toBeLessThanOrEqual(500);
    // After trimming to 500 the remaining slice still starts with "Bearer " and is redacted.
    expect(persisted.reason).toBe("Bearer [redacted]");
  });

  it("defaults optional fields to null when omitted", async () => {
    const { writer, append } = makeWriter();
    const useCase = new AppendAuditEventUseCase(writer);

    await useCase.execute({
      actorType: "system",
      actorId: "system",
      action: "device_client.registered",
      targetType: "device_client",
      targetId: "device-3",
      result: "succeeded",
    });

    const persisted = append.mock.calls[0]![0];
    expect(persisted).toMatchObject({
      displayName: null,
      requestId: null,
      taskId: null,
      parentTaskId: null,
      changeSetId: null,
      recoveryPointId: null,
      summary: null,
      reason: null,
    });
  });

  it("returns the audit event id from the writer", async () => {
    const { writer } = makeWriter();
    const useCase = new AppendAuditEventUseCase(writer);

    const result = await useCase.execute({
      actorType: "user",
      actorId: "user-1",
      action: "device_client.renamed",
      targetType: "device_client",
      targetId: "device-1",
      result: "succeeded",
    });

    expect(result).toEqual({ auditEventId: "audit-1" });
  });

  it("redacts url and header values embedded in summary", async () => {
    const { writer, append } = makeWriter();
    const useCase = new AppendAuditEventUseCase(writer);

    await useCase.execute({
      actorType: "user",
      actorId: "user-1",
      action: "device_client.revoked",
      targetType: "device_client",
      targetId: "device-1",
      result: "succeeded",
      summary: {
        playbackUrl: "https://upstream.example/path?token=supersecret",
        headers: '"Authorization":"Bearer abc123"',
      },
    });

    const persisted = append.mock.calls[0]![0];
    expect(persisted.summary).toEqual({
      playbackUrl: "https://upstream.example/path?token=[redacted]",
      headers: '"Authorization":"[redacted]"',
    });
  });
});
