import { randomUUID, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import argon2 from "argon2";
import { db } from "@/lib/db";
import { createOpaqueToken } from "@/lib/crypto";
import { checkAuthRateLimit } from "@/lib/rate-limit";
import { sendPlatformEmail } from "@/lib/mail";
import { requestId } from "@/lib/http";

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(12).max(128), name: z.string().trim().min(1).max(100).optional() }).strict();
export async function POST(request: Request) {
  const id = requestId(request);
  if (!(await checkAuthRateLimit(request, "register", 5))) return NextResponse.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." }, request_id: id }, { status: 429, headers: { "x-request-id": id, "cache-control": "no-store" } });
  let parsed;
  try { parsed = schema.safeParse(await request.json()); } catch { parsed = null; }
  if (!parsed || !parsed.success) return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "Provide a valid email, a password of at least 12 characters, and an optional name." }, request_id: id }, { status: 400, headers: { "x-request-id": id, "cache-control": "no-store" } });
  const email = parsed.data.email.toLowerCase();
  const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const token = createOpaqueToken(32);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const local = email.split("@")[0].replace(/[^a-z0-9-]/g, "-").slice(0, 24) || "workspace";
  try {
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email, passwordHash, name: parsed.data.name } });
      const organization = await tx.organization.create({ data: { name: `${parsed.data.name || local}'s workspace`, slug: `${local}-${randomUUID().slice(0, 8)}` } });
      await tx.organizationMembership.create({ data: { userId: created.id, organizationId: organization.id, role: "OWNER" } });
      await tx.project.create({ data: { name: "My first project", organizationId: organization.id } });
      await tx.authToken.create({ data: { userId: created.id, tokenHash, purpose: "EMAIL_VERIFICATION", expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
      await tx.auditEvent.create({ data: { actorUserId: created.id, organizationId: organization.id, action: "auth.registered", resourceType: "User", resourceId: created.id, requestId: id } });
      return created;
    });
    const verifyUrl = new URL("/api/v1/auth/verify", process.env.APP_URL || "http://localhost:3000");
    verifyUrl.searchParams.set("token", token);
    await sendPlatformEmail({ to: user.email, subject: "Verify your MailBridge email", text: `Verify your email by opening: ${verifyUrl.toString()}`, html: `<p>Welcome to MailBridge.</p><p><a href="${verifyUrl.toString()}">Verify your email address</a></p><p>This link expires in 24 hours.</p>` });
    return NextResponse.json({ success: true, message: "Account created. Check your email to verify your address before signing in.", request_id: id }, { status: 201, headers: { "x-request-id": id, "cache-control": "no-store" } });
  } catch (error) {
    // Avoid revealing whether an account exists. Provider failures do not return internal details.
    const duplicate = error && typeof error === "object" && "code" in error && error.code === "P2002";
    if (duplicate) return NextResponse.json({ success: true, message: "If this address can be registered, verification instructions will be sent.", request_id: id }, { status: 202, headers: { "x-request-id": id, "cache-control": "no-store" } });
    return NextResponse.json({ success: false, error: { code: "REGISTRATION_UNAVAILABLE", message: "Registration could not be completed. Check platform email configuration or try again later." }, request_id: id }, { status: 503, headers: { "x-request-id": id, "cache-control": "no-store" } });
  }
}
