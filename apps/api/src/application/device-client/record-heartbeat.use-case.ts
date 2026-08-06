import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import {
  DEVICE_CLIENT_REPOSITORY,
  type DeviceClientRepository,
} from "@/domain/device-client";
import {
  CONTENT_MANIFEST_REPOSITORY,
  type ContentManifestRepository,
} from "@/domain/content";
import { AppendAuditEventUseCase } from "@/application/audit/append-audit-event.use-case";
import { AUDIT_ACTIONS } from "@/domain/audit/audit-actions";

@Injectable()
export class RecordHeartbeatUseCase {
  constructor(
    @Inject(DEVICE_CLIENT_REPOSITORY)
    private readonly repo: DeviceClientRepository,
    @Optional()
    @Inject(CONTENT_MANIFEST_REPOSITORY)
    private readonly contentManifest?: ContentManifestRepository,
    @Optional()
    @Inject(AppendAuditEventUseCase)
    private readonly audit?: AppendAuditEventUseCase,
  ) {}

  async execute(command: {
    deviceClientId?: string;
    appVersion: string;
    platformVersion: string;
    requestId?: string | null;
  }) {
    if (!command.deviceClientId) {
      throw new ForbiddenException({
        code: "device-principal-required",
        status: 403,
      });
    }
    const result = await this.repo.recordHeartbeat({
      deviceClientId: command.deviceClientId,
      appVersion: command.appVersion,
      platformVersion: command.platformVersion,
    });
    if (result.kind === "revoked") {
      // FR-016: a revoked client attempting to use protected access is a
      // security-relevant lifecycle event. Best-effort; never blocks the
      // rejection itself.
      void this.audit
        ?.execute({
          actorType: "system",
          actorId: "system",
          action: AUDIT_ACTIONS.deviceClient.revokedAccessRejected,
          targetType: "device_client",
          targetId: command.deviceClientId,
          displayName: null,
          result: "failed",
          requestId: command.requestId ?? null,
          summary: { reason: "heartbeat-after-revoke" },
        })
        .catch(() => {
          /* intentionally swallowed: observability must not change the response */
        });
      throw new UnauthorizedException({
        code: "device-client-revoked",
        status: 401,
      });
    }
    if (result.kind === "not_found") {
      throw new UnauthorizedException({
        code: "access-token-invalid",
        status: 401,
      });
    }
    if (result.kind !== "updated") {
      throw new UnauthorizedException({
        code: "access-token-invalid",
        status: 401,
      });
    }
    let contentRevision: Awaited<ReturnType<ContentManifestRepository["getCurrent"]>> | undefined;
    try {
      contentRevision = await this.contentManifest?.getCurrent();
    } catch {
      // Liveness must remain available if the optional content invalidation
      // read is temporarily unavailable; the next heartbeat retries it.
    }
    return {
      serverTime: new Date(),
      lastActiveAt: result.lastHeartbeatAt,
      nextHeartbeatInSeconds: 60 as const,
      onlineWindowSeconds: 150 as const,
      contentRevision,
    };
  }
}
