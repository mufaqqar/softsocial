import crypto from "node:crypto";

/**
 * master.txt 3.13: encrypt access and refresh tokens at rest.
 *
 * AES-256-GCM, so a token is authenticated as well as encrypted: a row edited
 * directly in the database cannot be swapped for an attacker-controlled value
 * without the auth tag failing. The layout is versioned so the algorithm can be
 * rotated later without a migration:
 *
 *   v1.<iv>.<authTag>.<ciphertext>   (all base64url)
 *
 * This module deliberately has no `server-only` marker. It is imported both by
 * the Next.js app and by the standalone worker process, and `server-only`
 * throws outside a React Server Component bundle.
 */

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class TokenEncryptionError extends Error {}

function encryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;

  if (!raw) {
    throw new TokenEncryptionError(
      "ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32`.",
    );
  }

  // Accept base64 (what the docs and openssl produce) or a raw 32-char string so
  // a hand-written development value does not fail in a confusing way.
  const key = /^[A-Za-z0-9+/]{43}=$/.test(raw) ? Buffer.from(raw, "base64") : Buffer.from(raw, "utf8");

  if (key.length !== KEY_BYTES) {
    throw new TokenEncryptionError(
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}.`,
    );
  }

  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(".");

  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new TokenEncryptionError("Stored token is not in a recognised format.");
  }

  const [, ivRaw, tagRaw, dataRaw] = parts as [string, string, string, string];

  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      encryptionKey(),
      Buffer.from(ivRaw, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(dataRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    // Never echo the payload: it is a credential.
    throw new TokenEncryptionError(
      `Stored token could not be decrypted (${(error as Error).message}). ` +
        "It was most likely encrypted with a different ENCRYPTION_KEY.",
    );
  }
}

/**
 * A display form for the UI. Tokens are never sent to the browser, so the only
 * thing worth showing is enough to tell two connections apart.
 */
export function maskSecret(token: string | null | undefined): string {
  if (!token) {
    return "—";
  }

  return `••••${token.slice(-4)}`;
}

/** True when the key is configured, so the UI can explain rather than crash. */
export function isEncryptionConfigured(): boolean {
  try {
    encryptionKey();

    return true;
  } catch {
    return false;
  }
}
