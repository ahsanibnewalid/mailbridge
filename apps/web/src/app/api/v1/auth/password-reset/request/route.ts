import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createOpaqueToken } from "@/lib/crypto";
import { checkAuthRateLimit } from "@/lib/rate-limit";
import { sendPlatformEmail } from "@/lib/mail";
import { requestId } from "@/lib/http";
const schema = z.object({ email: z.string().trim().email().max(254) }).strict();
export async function POST(request: Request) {
  const id = requestId(request);
  if (!(await checkAuthRateLimit(request, "password-reset", 5))) return NextResponse.json({ success: true, message: "If the account is eligible, reset instructions will be sent.", request_id: id }, { status: 202, headers: { "cache-control": "no-store" } });
  let parsed; try { parsed = schema.safeParse(await request.json()); } catch { parsed = null; }
  if (parsed?.success) {
    const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (user && user.emailVerifiedAt && !user.disabledAt) {
      const token = createOpaqueToken(32); const tokenHash = createHash("sha256").update(token).digest("hex");
      await db.authToken.create({ data: { userId: user.id, tokenHash, purpose: "PASSWORD_RESET", expiresAt: new Date(Date.now() + 30 * 60_000) } });
      const url = new URL("/reset-password", process.env.APP_URL || "http://localhost:3000"); url.searchParams.set("token", token);
      try { await sendPlatformEmail({ to: user.email, subject: "Reset your MailBridge password", text: `Reset your password using this link within 30 minutes: ${url.toString()}`, html: `<p>Use the link below to reset your MailBridge password. It expires in 30 minutes.</p><p><a href="${url.toString()}">Reset password</a></p>` }); } catch { /* Return the same response to avoid account enumeration. */ }
    }
  }
  return NextResponse.json({ success: true, message: "If the account is eligible, reset instructions will be sent.", request_id: id }, { status: 202, headers: { "x-request-id": id, "cache-control": "no-store" } });
}
