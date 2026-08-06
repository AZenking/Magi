import { createHash, createHmac, randomBytes } from "node:crypto";
import { DEVICE_CLIENT_CONFIG } from "../../infrastructure/config/device-client.config";
import {
  hashSecret,
  maskSecretPrefix,
  generateAccessToken,
} from "../../shared/crypto/secret-utils";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function hashDeviceCode(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function digestUserCode(value: string): string {
  const normalized = value.replace(/-/g, "").toUpperCase();
  return createHmac("sha256", DEVICE_CLIENT_CONFIG.userCodePepper)
    .update(normalized)
    .digest("hex");
}

export function generateDeviceCode(): string {
  return randomBytes(32).toString("base64url");
}

export function generateUserCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i += 1) code += ALPHABET[bytes[i]! % ALPHABET.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function generateRefreshToken(): string {
  return `rft_${randomBytes(48).toString("base64url")}`;
}

export function makeAccessTokenMaterial(expiresAt: Date) {
  const plaintext = generateAccessToken();
  return {
    plaintext,
    hash: hashSecret(plaintext),
    prefix: maskSecretPrefix(plaintext),
    expiresAt,
  };
}

export function makeRefreshTokenMaterial(expiresAt: Date) {
  const plaintext = generateRefreshToken();
  return {
    plaintext,
    hash: hashSecret(plaintext),
    prefix: maskSecretPrefix(plaintext),
    expiresAt,
  };
}
