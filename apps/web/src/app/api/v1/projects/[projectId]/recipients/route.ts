import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requestId } from "@/lib/http";
import { sameOriginAllowed, userCanManageProject } from "@/lib/project-auth";
const schema = z.object({ email: z.string().trim().email().max(254) }).strict();
export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) { const user = await getCurrentUser(); if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED" } }, { status: 401 }); const { projectId } = await context.params; if (!(await userCanManageProject(user.id, projectId))) return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 }); const recipients = await db.allowedRecipient.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }); return NextResponse.json({ success: true, recipients }, { headers: { "cache-control": "no-store" } }); }
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) { const id = requestId(request); if (!sameOriginAllowed(request)) return NextResponse.json({ success: false, error: { code: "ORIGIN_REJECTED" }, request_id: id }, { status: 403 }); const user = await getCurrentUser(); if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED" }, request_id: id }, { status: 401 }); const { projectId } = await context.params; if (!(await userCanManageProject(user.id, projectId, ["OWNER", "ADMINISTRATOR"]))) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" }, request_id: id }, { status: 403 }); let parsed; try { parsed = schema.safeParse(await request.json()); } catch { parsed = null; } if (!parsed || !parsed.success) return NextResponse.json({ success: false, error: { code: "INVALID_RECIPIENT" }, request_id: id }, { status: 400 }); const recipient = await db.allowedRecipient.upsert({ where: { projectId_email: { projectId, email: parsed.data.email.toLowerCase() } }, create: { projectId, email: parsed.data.email.toLowerCase() }, update: {} }); await db.auditEvent.create({ data: { actorUserId: user.id, action: "recipient.allowlisted", resourceType: "AllowedRecipient", resourceId: recipient.id, requestId: id } }); return NextResponse.json({ success: true, recipient }, { status: 201, headers: { "cache-control": "no-store" } }); }

export async function DELETE(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const id = requestId(request);
  if (!sameOriginAllowed(request)) return NextResponse.json({ success: false, error: { code: "ORIGIN_REJECTED" }, request_id: id }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED" }, request_id: id }, { status: 401 });
  const { projectId } = await context.params;
  if (!(await userCanManageProject(user.id, projectId, ["OWNER", "ADMINISTRATOR"]))) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" }, request_id: id }, { status: 403 });
  let body;
  try { body = z.object({ recipient_id: z.string().min(1).max(100) }).strict().safeParse(await request.json()); } catch { body = null; }
  if (!body || !body.success) return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST" }, request_id: id }, { status: 400 });
  const deleted = await db.allowedRecipient.deleteMany({ where: { id: body.data.recipient_id, projectId } });
  if (deleted.count !== 1) return NextResponse.json({ success: false, error: { code: "RECIPIENT_NOT_FOUND" }, request_id: id }, { status: 404 });
  await db.auditEvent.create({ data: { actorUserId: user.id, action: "recipient.removed", resourceType: "AllowedRecipient", resourceId: body.data.recipient_id, requestId: id } });
  return NextResponse.json({ success: true, removed: true, request_id: id }, { headers: { "cache-control": "no-store" } });
}
