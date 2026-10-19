import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { encryptSecret } from "@/lib/crypto";
import { requestId } from "@/lib/http";
import { sameOriginAllowed, userCanManageProject } from "@/lib/project-auth";
const schema = z.object({ api_key: z.string().min(10).max(500), default_from_email: z.string().trim().email().max(254), default_from_name: z.string().trim().max(100).optional() }).strict();
export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) { const user = await getCurrentUser(); if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED" } }, { status: 401 }); const { projectId } = await context.params; if (!(await userCanManageProject(user.id, projectId))) return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 }); const providers = await db.emailProviderConnection.findMany({ where: { projectId }, select: { id: true, provider: true, displayName: true, defaultFromEmail: true, defaultFromName: true, enabled: true, lastTestedAt: true, lastErrorCode: true, createdAt: true } }); return NextResponse.json({ success: true, providers }, { headers: { "cache-control": "no-store" } }); }
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const id = requestId(request); if (!sameOriginAllowed(request)) return NextResponse.json({ success: false, error: { code: "ORIGIN_REJECTED" }, request_id: id }, { status: 403 });
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED" }, request_id: id }, { status: 401 });
  const { projectId } = await context.params; if (!(await userCanManageProject(user.id, projectId, ["OWNER", "ADMINISTRATOR"]))) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" }, request_id: id }, { status: 403 });
  let parsed; try { parsed = schema.safeParse(await request.json()); } catch { parsed = null; }
  if (!parsed || !parsed.success) return NextResponse.json({ success: false, error: { code: "INVALID_PROVIDER_CONFIG", message: "Provide a valid Resend API key and sender email." }, request_id: id }, { status: 400 });
  const domain = parsed.data.default_from_email.split("@").pop()?.toLowerCase();
  try {
    const response = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${parsed.data.api_key}` }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!response.ok) return NextResponse.json({ success: false, error: { code: "PROVIDER_AUTH_FAILED", message: "The provider rejected the API key or the key cannot list sender domains." }, request_id: id }, { status: 400, headers: { "cache-control": "no-store" } });
    const result = await response.json() as { data?: Array<{ name?: string; status?: string }> };
    const verified = (result.data ?? []).some(item => item.name?.toLowerCase() === domain && item.status?.toLowerCase() === "verified");
    if (!verified) return NextResponse.json({ success: false, error: { code: "SENDER_DOMAIN_NOT_VERIFIED", message: "Verify this sender domain in Resend before connecting it to MailBridge." }, request_id: id }, { status: 400, headers: { "cache-control": "no-store" } });
    const encryptedCredentials = encryptSecret(JSON.stringify({ apiKey: parsed.data.api_key }));
    const saved = await db.$transaction(async tx => {
      const provider = await tx.emailProviderConnection.create({ data: { projectId, provider: "resend", displayName: "Resend", encryptedCredentials, defaultFromEmail: parsed.data.default_from_email.toLowerCase(), defaultFromName: parsed.data.default_from_name, lastTestedAt: new Date(), enabled: true } });
      await tx.senderIdentity.upsert({ where: { projectId_email: { projectId, email: provider.defaultFromEmail } }, create: { projectId, email: provider.defaultFromEmail, name: provider.defaultFromName, verifiedAt: new Date(), isDefault: true }, update: { name: provider.defaultFromName, verifiedAt: new Date(), isDefault: true } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "provider.connected", resourceType: "EmailProviderConnection", resourceId: provider.id, requestId: id, metadata: { provider: "resend", senderDomain: domain } } });
      return provider;
    });
    return NextResponse.json({ success: true, provider: { id: saved.id, provider: saved.provider, default_from_email: saved.defaultFromEmail, enabled: saved.enabled, last_tested_at: saved.lastTestedAt } }, { status: 201, headers: { "cache-control": "no-store", "x-request-id": id } });
  } catch {
    return NextResponse.json({ success: false, error: { code: "PROVIDER_CHECK_FAILED", message: "Could not verify provider configuration. Check the platform encryption key and try again." }, request_id: id }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
