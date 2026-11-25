import { describe, expect, it } from "vitest";
import { hashPassword, validatePassword, verifyPassword } from "../passwords";
import { generateToken, hashToken, tokensEqual } from "../tokens";

describe("password policy", () => {
  it("enforces length, common-password and email rules", () => {
    expect(validatePassword("short", "priya@example.com")).toMatch(/12 characters/);
    expect(validatePassword("password1234", "priya@example.com")).toMatch(/common/);
    expect(validatePassword("priya-strong-pass", "priya@example.com")).toMatch(/email/);
    expect(validatePassword("correct horse battery", "priya@example.com")).toBeNull();
  });

  it("hashes with scrypt and verifies without storing the plaintext", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("correct horse battery");
    await expect(verifyPassword("correct horse battery", stored)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", stored)).resolves.toBe(false);
    await expect(verifyPassword("anything", null)).resolves.toBe(false);
  });
});

describe("opaque tokens", () => {
  it("generates unique tokens and stores only a stable SHA-256 hash", () => {
    const first = generateToken();
    const second = generateToken();
    expect(first).not.toBe(second);
    expect(hashToken(first)).toHaveLength(64);
    expect(hashToken(first)).toBe(hashToken(first));
    expect(tokensEqual(hashToken(first), hashToken(first))).toBe(true);
    expect(tokensEqual(hashToken(first), hashToken(second))).toBe(false);
  });
});
