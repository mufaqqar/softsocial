import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("round-trips a password", async () => {
    const hash = await hashPassword("Softsocial123");

    await expect(verifyPassword("Softsocial123", hash)).resolves.toBe(true);
  });

  it("stores a versioned scrypt hash, never the password", async () => {
    const hash = await hashPassword("Softsocial123");

    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash).not.toContain("Softsocial123");
    // scheme$saltHex$hashHex
    expect(hash.split("$")).toHaveLength(3);
  });

  it("salts each hash separately", async () => {
    const [first, second] = await Promise.all([
      hashPassword("Softsocial123"),
      hashPassword("Softsocial123"),
    ]);

    expect(first).not.toBe(second);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("Softsocial123");

    await expect(verifyPassword("softsocial123", hash)).resolves.toBe(false);
  });

  it("rejects empty, missing and malformed stored hashes", async () => {
    await expect(verifyPassword("Softsocial123", null)).resolves.toBe(false);
    await expect(verifyPassword("Softsocial123", undefined)).resolves.toBe(false);
    await expect(verifyPassword("Softsocial123", "")).resolves.toBe(false);
    await expect(verifyPassword("Softsocial123", "bcrypt$aa$bb")).resolves.toBe(false);
    await expect(verifyPassword("Softsocial123", "scrypt$$")).resolves.toBe(false);
  });

  it("rejects a hash whose stored length is zero", async () => {
    await expect(verifyPassword("Softsocial123", "scrypt$aa$")).resolves.toBe(false);
  });
});
