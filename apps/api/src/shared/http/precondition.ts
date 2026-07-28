/**
 * ETag / If-Match precondition helpers (T026).
 *
 * Wire convention: mutable resources expose numeric `version` and emit
 * `ETag: "<version>"`. Overwrites require `If-Match: "<version>"`.
 *
 *   - Missing If-Match  → 428 precondition-required
 *   - Stale If-Match    → 412 stale-resource (with currentVersion)
 *
 * (contracts/common.md)
 */
import { type CanActivate, type ExecutionContext, Injectable, PreconditionFailedException } from "@nestjs/common";
import type { Request } from "express";

/** Render the wire ETag for a numeric version. */
export function etagFor(version: number): string {
  return `"${version}"`;
}

/** Parse an If-Match header into the numeric version, or null if absent/invalid. */
export function parseIfMatch(ifMatch: string | undefined | null): number | null {
  if (!ifMatch) return null;
  const m = ifMatch.match(/^"?(\d+)"?$/);
  return m && m[1] ? Number.parseInt(m[1], 10) : null;
}

/**
 * Require an If-Match header on the request. Throws `PreconditionFailedException`
 * with code `precondition-required` (mapped to 428 by the Problem Details filter).
 * Use as a method-level guard on overwrite/lifecycle/reorder/schedule routes.
 */
@Injectable()
export class IfMatchRequiredGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const ifMatch = req.header("if-match");
    if (!ifMatch) {
      throw new PreconditionFailedException({
        code: "precondition-required",
        title: "If-Match is required",
        status: 428,
      });
    }
    return true;
  }
}
