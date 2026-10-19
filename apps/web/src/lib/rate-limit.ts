import { createHash } from "node:crypto";
import { db } from "@/lib/db";

async function incrementWindow(keyHash: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);
  const rows = await db.$queryRaw<Array<{ count: number }>>`INSERT INTO "AuthRateLimit" ("keyHash", "count", "windowStartedAt", "updatedAt") VALUES (${keyHash}, 1, ${now}, ${now}) ON CONFLICT ("keyHash") DO UPDATE SET "count" = CASE WHEN "AuthRateLimit"."windowStartedAt" <= ${cutoff} THEN 1 ELSE "AuthRateLimit"."count" + 1 END, "windowStartedAt" = CASE WHEN "AuthRateLimit"."windowStartedAt" <= ${cutoff} THEN ${now} ELSE "AuthRateLimit"."windowStartedAt" END, "updatedAt" = ${now} RETURNING "count"`;
  return (rows[0]?.count ?? limit + 1) <= limit;
}

/** Rate-limit an opaque identity without storing the raw identity in PostgreSQL. */
export async function checkFixedRateLimit(identity: string, bucket: string, limit: number, windowMs: number): Promise<boolean> {
  const keyHash = createHash("sha256").update(`${bucket}:${identity}`).digest("hex");
  return incrementWindow(keyHash, limit, windowMs);
}

export async function checkAuthRateLimit(request: Request, bucket: string, limit = 8, windowMs = 15 * 60_000): Promise<boolean> {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("x-real-ip")?.trim() || forwarded || "unknown";
  return checkFixedRateLimit(ip, `auth:${bucket}`, limit, windowMs);
}
