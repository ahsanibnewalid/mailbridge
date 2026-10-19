import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hashCredential, verifyCredential } from "./crypto";

afterEach(() => { delete process.env.PROVIDER_ENCRYPTION_KEY_BASE64; });

describe("credential and secret helpers", () => {
  it("hashes credentials and compares without plain-text storage", () => {
    const hash = hashCredential("mb_private_test_value");
    expect(hash).not.toContain("mb_private_test_value");
    expect(verifyCredential("mb_private_test_value", hash)).toBe(true);
    expect(verifyCredential("wrong", hash)).toBe(false);
  });
  it("encrypts and decrypts provider secrets with AES-GCM", () => {
    process.env.PROVIDER_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString("base64");
    const ciphertext = encryptSecret("provider-secret");
    expect(ciphertext).not.toContain("provider-secret");
    expect(decryptSecret(ciphertext)).toBe("provider-secret");
  });
  it("rejects invalid key sizes", () => {
    process.env.PROVIDER_ENCRYPTION_KEY_BASE64 = "bad";
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });
});
