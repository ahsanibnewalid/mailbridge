import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requestId } from "@/lib/http";
import { sameOriginAllowed } from "@/lib/project-auth";
const schema = z.object({ organization_id: z.string().min(1), name: z.string().trim().min(2).max(80) }).strict();
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Sign in first." } }, { status: 401, headers: { "cache-control": "no-store" } });
  const memberships = await db.organizationMembership.findMany({ where: { userId: user.id }, include: { organization: { include: { projects: { orderBy: { createdAt: "desc" } } } } } });
  return NextResponse.json({ success: true, projects: memberships.flatMap(m => m.organization.projects.map(p => ({ id: p.id, name: p.name, organization_id: p.organizationId, monthly_quota: p.monthlyQuota, enabled: p.enabled, created_at: p.createdAt }))) }, { headers: { "cache-control": "no-store" } });
}
export async function POST(request: Request) {
  const id = requestId(request);
  if (!sameOriginAllowed(request)) return NextResponse.json({ success: false, error: { code: "ORIGIN_REJECTED", message: "Request origin is not allowed." }, request_id: id }, { status: 403, headers: { "cache-control": "no-store" } });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Sign in first." }, request_id: id }, { status: 401, headers: { "cache-control": "no-store" } });
  let parsed; try { parsed = schema.safeParse(await request.json()); } catch { parsed = null; }
  if (!parsed || !parsed.success) return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "Provide organization_id and a project name." }, request_id: id }, { status: 400, headers: { "cache-control": "no-store" } });
  const membership = await db.organizationMembership.findFirst({ where: { userId: user.id, organizationId: parsed.data.organization_id, role: { in: ["OWNER", "ADMINISTRATOR"] } } });
  if (!membership) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "You cannot create projects in this organization." }, request_id: id }, { status: 403, headers: { "cache-control": "no-store" } });
  const project = await db.project.create({ data: { name: parsed.data.name, organizationId: membership.organizationId } });
  await db.auditEvent.create({ data: { actorUserId: user.id, organizationId: membership.organizationId, action: "project.created", resourceType: "Project", resourceId: project.id, requestId: id } });
  return NextResponse.json({ success: true, project: { id: project.id, name: project.name, organization_id: project.organizationId, monthly_quota: project.monthlyQuota } }, { status: 201, headers: { "x-request-id": id, "cache-control": "no-store" } });
}
