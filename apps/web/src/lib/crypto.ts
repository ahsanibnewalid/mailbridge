import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function encryptionKey(): Buffer {
  const encoded = process.env.PROVIDER_ENCRYPTION_KEY_BASE64;
  if (!encoded) throw new Error("PROVIDER_ENCRYPTION_KEY_BASE64 is required");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("PROVIDER_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes");
  return key;
}

export function encryptSecret(plaintext: string): string {
  const { createCipheriv } = require("node:crypto") as typeof import("node:crypto");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(encoded: string): string {
  const { createDecipheriv } = require("node:crypto") as typeof import("node:crypto");
  const [version, ivText, tagText, ciphertextText, extra] = encoded.split(".");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText || extra) throw new Error("Invalid encrypted secret format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}

export function hashCredential(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function verifyCredential(secret: string, expectedHex: string): boolean {
  const actual = Buffer.from(hashCredential(secret), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hmacSha256(value: string, key: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}
