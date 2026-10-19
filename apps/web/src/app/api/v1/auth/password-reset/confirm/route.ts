import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import argon2 from "argon2";
import { db } from "@/lib/db";
import { checkAuthRateLimit } from "@/lib/rate-limit";
import { requestId } from "@/lib/http";
const schema = z.object({ token: z.string().min(32).max(200), password: z.string().min(12).max(128) }).strict();
export async function POST(request: Request) {
  const id = requestId(request);
  if (!(await checkAuthRateLimit(request, "password-reset-confirm", 8))) return NextResponse.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." }, request_id: id }, { status: 429, headers: { "cache-control": "no-store" } });
  let parsed; try { parsed = schema.safeParse(await request.json()); } catch { parsed = null; }
  if (!parsed || !parsed.success) return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "Provide a valid reset token and a password of at least 12 characters." }, request_id: id }, { status: 400, headers: { "cache-control": "no-store" } });
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  try {
    const done = await db.$transaction(async tx => {
      const token = await tx.authToken.findUnique({ where: { tokenHash } });
      const now = new Date();
      if (!token || token.purpose !== "PASSWORD_RESET" || token.usedAt || token.expiresAt <= now) return false;
      await tx.authToken.update({ where: { id: token.id }, data: { usedAt: now } });
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      await tx.session.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: now } });
      await tx.auditEvent.create({ data: { actorUserId: token.userId, action: "auth.password_reset", resourceType: "User", resourceId: token.userId, requestId: id } });
      return true;
    });
    if (!done) return NextResponse.json({ success: false, error: { code: "INVALID_TOKEN", message: "This reset link is invalid or expired." }, request_id: id }, { status: 400, headers: { "cache-control": "no-store" } });
    return NextResponse.json({ success: true, message: "Password updated. Sign in again with your new password.", request_id: id }, { headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ success: false, error: { code: "RESET_UNAVAILABLE", message: "Password reset is temporarily unavailable." }, request_id: id }, { status: 503, headers: { "cache-control": "no-store" } }); }
}
