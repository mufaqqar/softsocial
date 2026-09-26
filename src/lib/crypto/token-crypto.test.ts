import { afterEach, describe, expect, it } from "vitest";

import {
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
  maskSecret,
  TokenEncryptionError,
} from "@/lib/crypto/token-crypto";

const KEY = Buffer.alloc(32, 7).toString("base64");

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe("token encryption", () => {
  it("round-trips a token", () => {
    process.env.ENCRYPTION_KEY = KEY;
    const token = "EAABwzLixnjYBO7ZBsecret";

    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it("round-trips an empty string and a very long token", () => {
    process.env.ENCRYPTION_KEY = KEY;

    expect(decryptSecret(encryptSecret(""))).toBe("");
    const long = "x".repeat(8000);

    expect(decryptSecret(encryptSecret(long))).toBe(long);
  });

  it("never stores the plaintext in the payload", () => {
    process.env.ENCRYPTION_KEY = KEY;
    const encrypted = encryptSecret("super-secret-value");

    expect(encrypted).not.toContain("super-secret-value");
    expect(encrypted.split(".")).toHaveLength(4);
    expect(encrypted.startsWith("v1.")).toBe(true);
  });

  it("produces a different ciphertext each time", () => {
    process.env.ENCRYPTION_KEY = KEY;
    const a = encryptSecret("same-token");
    const b = encryptSecret("same-token");

    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it("refuses a tampered ciphertext", () => {
    process.env.ENCRYPTION_KEY = KEY;
    const parts = encryptSecret("token-value").split(".");
    // Flip a character in the ciphertext; the auth tag must reject it.
    const data = Buffer.from(parts[3], "base64url");
    data[0] ^= 0xff;
    parts[3] = data.toString("base64url");

    expect(() => decryptSecret(parts.join("."))).toThrow(TokenEncryptionError);
  });

  it("refuses a token encrypted under a different key", () => {
    process.env.ENCRYPTION_KEY = KEY;
    const encrypted = encryptSecret("token-value");
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");

    expect(() => decryptSecret(encrypted)).toThrow(TokenEncryptionError);
  });

  it("rejects a malformed payload", () => {
    process.env.ENCRYPTION_KEY = KEY;

    expect(() => decryptSecret("not-a-token")).toThrow(TokenEncryptionError);
    expect(() => decryptSecret("v2.a.b.c")).toThrow(TokenEncryptionError);
  });

  it("explains a missing key rather than crashing opaquely", () => {
    expect(() => encryptSecret("x")).toThrow(/ENCRYPTION_KEY/);
    expect(isEncryptionConfigured()).toBe(false);

    process.env.ENCRYPTION_KEY = "too-short";
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
    expect(isEncryptionConfigured()).toBe(false);

    process.env.ENCRYPTION_KEY = KEY;
    expect(isEncryptionConfigured()).toBe(true);
  });

  it("does not leak the token in an error message", () => {
    process.env.ENCRYPTION_KEY = KEY;
    const encrypted = encryptSecret("EAAAsupersecret");
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");

    expect(() => decryptSecret(encrypted)).toThrow(TokenEncryptionError);
    try {
      decryptSecret(encrypted);
    } catch (error) {
      expect((error as Error).message).not.toContain("supersecret");
    }
  });
});

describe("maskSecret", () => {
  it("shows only the last four characters", () => {
    expect(maskSecret("abcdefghijkl")).toBe("••••ijkl");
  });

  it("handles a missing token", () => {
    expect(maskSecret(null)).toBe("—");
    expect(maskSecret(undefined)).toBe("—");
    expect(maskSecret("")).toBe("—");
  });
});
