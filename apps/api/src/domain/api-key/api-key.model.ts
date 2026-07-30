/**
 * ApiKey domain model (005-open-channels-epg-api, data-model.md).
 *
 * Framework-agnostic (constitution III): no NestJS, no Drizzle, no Node crypto.
 * The plaintext key is never stored here — only the hash and a masked prefix.
 *
 * Status machine:
 *   active ⇄ disabled   (reversible, admin-driven)
 *   → revoked           (terminal, irreversible)
 *   → delete            (physical row removal, any state)
 */
export type ApiKeyStatus = "active" | "disabled" | "revoked";

export interface ApiKey {
  id: string;
  name: string;
  /** SHA-256(plaintext) hex. Never the plaintext. */
  keyHash: string;
  /** Masked prefix, e.g. `magi_3f9…`. For list display only. */
  keyPrefix: string;
  status: ApiKeyStatus;
  /** null = no expiry. */
  expiresAt: Date | null;
  /** Reserved for future per-key scopes (YAGNI — unused in v1). */
  scopes: unknown;
  lastUsedAt: Date | null;
  createdBy: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Allowed forward transitions. `revoked` is terminal. */
const ALLOWED_TRANSITIONS: Record<ApiKeyStatus, readonly ApiKeyStatus[]> = {
  active: ["disabled", "revoked"],
  disabled: ["active", "revoked"],
  revoked: [],
};

export class ApiKeyModel {
  constructor(private readonly key: ApiKey) {}

  /** Whether the key may be used right now: active AND not expired. */
  isUsable(now: Date = new Date()): boolean {
    if (this.key.status !== "active") return false;
    if (this.key.expiresAt == null) return true;
    return this.key.expiresAt.getTime() > now.getTime();
  }

  /** Whether `target` is a legal status transition from the current state. */
  canTransitionTo(target: ApiKeyStatus): boolean {
    if (this.key.status === target) return false;
    return ALLOWED_TRANSITIONS[this.key.status].includes(target);
  }

  toObject(): ApiKey {
    return { ...this.key };
  }
}
