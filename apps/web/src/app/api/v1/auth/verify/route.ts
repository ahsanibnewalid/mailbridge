import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestId } from "@/lib/http";
export async function GET(request: Request) {
  const id = requestId(request);
  const token = new URL(request.url).searchParams.get("token");
  if (!token || token.length > 200) return NextResponse.json({ success: false, error: { code: "INVALID_TOKEN", message: "This verification link is invalid or expired." }, request_id: id }, { status: 400, headers: { "cache-control": "no-store" } });
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date();
  try {
    const result = await db.$transaction(async (tx) => {
      const row = await tx.authToken.findUnique({ where: { tokenHash }, include: { user: true } });
      if (!row || row.purpose !== "EMAIL_VERIFICATION" || row.usedAt || row.expiresAt <= now) return false;
      await tx.authToken.update({ where: { id: row.id }, data: { usedAt: now } });
      await tx.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: now } });
      await tx.auditEvent.create({ data: { actorUserId: row.userId, action: "auth.email_verified", resourceType: "User", resourceId: row.userId, requestId: id } });
      return true;
    });
    const destination = new URL(result ? "/login?verified=1" : "/login?verified=0", process.env.APP_URL || new URL(request.url).origin);
    return NextResponse.redirect(destination, { headers: { "cache-control": "no-store", "x-request-id": id } });
  } catch {
    return NextResponse.json({ success: false, error: { code: "VERIFICATION_UNAVAILABLE", message: "Verification is temporarily unavailable." }, request_id: id }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
