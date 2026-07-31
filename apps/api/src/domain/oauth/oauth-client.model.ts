/**
 * OauthClient domain model — Client Credentials Grant (004-safe-operations).
 *
 * Framework-agnostic (constitution III): no NestJS, no Drizzle, no Node crypto.
 * The client_secret plaintext is never stored — only its hash + masked prefix.
 *
 * Status machine (mirrors the former ApiKey model):
 *   active ⇄ disabled   (reversible — admin temporarily pauses token issuance;
 *                        already-issued tokens keep working until they expire)
 *   → revoked           (terminal, irreversible — all tokens batch-revoked)
 *   → delete            (physical row removal, any state)
 *
 * disable vs revoke is the key behavioural difference:
 *   disable only stops NEW token issuance; revoke kills ALL existing tokens too.
 */
export type ClientStatus = "active" | "disabled" | "revoked";
export type ClientKind = "confidential" | "public_device";

export interface OauthClient {
  id: string;
  /** Public client identifier, e.g. "magi_tv_android". */
  clientId: string;
  clientName: string;
  clientKind: ClientKind;
  /** SHA-256(client_secret) hex. Never the plaintext. */
  secretHash: string | null;
  /** Masked prefix, e.g. `magi_3f9…`. For list display only. */
  secretPrefix: string | null;
  status: ClientStatus;
  lastUsedAt: Date | null;
  createdBy: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Allowed forward transitions. `revoked` is terminal. */
const ALLOWED_TRANSITIONS: Record<ClientStatus, readonly ClientStatus[]> = {
  active: ["disabled", "revoked"],
  disabled: ["active", "revoked"],
  revoked: [],
};

export class OauthClientModel {
  constructor(private readonly client: OauthClient) {}

  /** Whether the client may mint new tokens right now. */
  isUsable(): boolean {
    return this.client.status === "active";
  }

  /** Whether `target` is a legal status transition from the current state. */
  canTransitionTo(target: ClientStatus): boolean {
    if (this.client.status === target) return false;
    return ALLOWED_TRANSITIONS[this.client.status].includes(target);
  }

  toObject(): OauthClient {
    return { ...this.client };
  }
}
