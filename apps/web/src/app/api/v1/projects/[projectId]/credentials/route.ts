import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { hashCredential } from "@/lib/crypto";
import { requestId } from "@/lib/http";
import { sameOriginAllowed, userCanManageProject } from "@/lib/project-auth";
const schema = z.object({ type: z.enum(["PUBLIC", "PRIVATE"]), label: z.string().trim().min(1).max(80) }).strict();
export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  const { projectId } = await context.params; if (!(await userCanManageProject(user.id, projectId, ["OWNER", "ADMINISTRATOR", "DEVELOPER"]))) return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  const credentials = await db.projectCredential.findMany({ where: { projectId }, select: { id: true, type: true, prefix: true, label: true, permissions: true, createdAt: true, lastUsedAt: true, revokedAt: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ success: true, credentials }, { headers: { "cache-control": "no-store" } });
}
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const id = requestId(request); if (!sameOriginAllowed(request)) return NextResponse.json({ success: false, error: { code: "ORIGIN_REJECTED" }, request_id: id }, { status: 403 });
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED" }, request_id: id }, { status: 401 });
  const { projectId } = await context.params; if (!(await userCanManageProject(user.id, projectId, ["OWNER", "ADMINISTRATOR"]))) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" }, request_id: id }, { status: 403 });
  let parsed; try { parsed = schema.safeParse(await request.json()); } catch { parsed = null; }
  if (!parsed || !parsed.success) return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "Provide credential type and label." }, request_id: id }, { status: 400 });
  const prefix = parsed.data.type === "PUBLIC" ? "mb_pub_" : "mb_priv_";
  const token = prefix + randomBytes(32).toString("base64url");
  const credential = await db.projectCredential.create({ data: { projectId, type: parsed.data.type, prefix: token.slice(0, 20), secretHash: hashCredential(token), label: parsed.data.label, permissions: ["email:send"] } });
  await db.auditEvent.create({ data: { actorUserId: user.id, action: "credential.created", resourceType: "ProjectCredential", resourceId: credential.id, requestId: id, metadata: { type: credential.type } } });
  return NextResponse.json({ success: true, credential: { id: credential.id, type: credential.type, label: credential.label, key: token, shown_once: true } }, { status: 201, headers: { "cache-control": "no-store", "x-request-id": id } });
}

export async function DELETE(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const id = requestId(request);
  if (!sameOriginAllowed(request)) return NextResponse.json({ success: false, error: { code: "ORIGIN_REJECTED" }, request_id: id }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED" }, request_id: id }, { status: 401 });
  const { projectId } = await context.params;
  if (!(await userCanManageProject(user.id, projectId, ["OWNER", "ADMINISTRATOR"]))) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" }, request_id: id }, { status: 403 });
  let body;
  try { body = z.object({ credential_id: z.string().min(1).max(100) }).strict().safeParse(await request.json()); } catch { body = null; }
  if (!body || !body.success) return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "Provide credential_id." }, request_id: id }, { status: 400 });
  const changed = await db.projectCredential.updateMany({ where: { id: body.data.credential_id, projectId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (changed.count !== 1) return NextResponse.json({ success: false, error: { code: "CREDENTIAL_NOT_FOUND", message: "Credential was not found or is already revoked." }, request_id: id }, { status: 404 });
  await db.auditEvent.create({ data: { actorUserId: user.id, action: "credential.revoked", resourceType: "ProjectCredential", resourceId: body.data.credential_id, requestId: id } });
  return NextResponse.json({ success: true, credential_id: body.data.credential_id, revoked: true, request_id: id }, { headers: { "cache-control": "no-store", "x-request-id": id } });
}
