import { NextResponse } from "next/server";
import { z } from "zod";
import argon2 from "argon2";
import { db } from "@/lib/db";
import { checkAuthRateLimit } from "@/lib/rate-limit";
import { createSession } from "@/lib/session";
import { requestId } from "@/lib/http";
const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) }).strict();
export async function POST(request: Request) {
  const id = requestId(request);
  if (!(await checkAuthRateLimit(request, "login", 8))) return NextResponse.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." }, request_id: id }, { status: 429, headers: { "cache-control": "no-store" } });
  let parsed;
  try { parsed = schema.safeParse(await request.json()); } catch { parsed = null; }
  if (!parsed || !parsed.success) return NextResponse.json({ success: false, error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect, or the account is not verified." }, request_id: id }, { status: 400, headers: { "cache-control": "no-store" } });
  const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  const valid = user ? await argon2.verify(user.passwordHash, parsed.data.password).catch(() => false) : false;
  if (!user || !valid || !user.emailVerifiedAt || user.disabledAt) return NextResponse.json({ success: false, error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect, or the account is not verified." }, request_id: id }, { status: 401, headers: { "cache-control": "no-store" } });
  await createSession(user.id);
  await db.auditEvent.create({ data: { actorUserId: user.id, action: "auth.login", resourceType: "User", resourceId: user.id, requestId: id } });
  return NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name }, request_id: id }, { status: 200, headers: { "x-request-id": id, "cache-control": "no-store" } });
}
