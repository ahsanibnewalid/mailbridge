import { db } from "@/lib/db";
import { verifyCredential } from "@/lib/crypto";

export async function authenticateProjectCredential(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(mb_(?:pub|priv)_[A-Za-z0-9_-]{32,100})$/.exec(authorization);
  if (!match) return null;
  const token = match[1];
  const type = token.startsWith("mb_pub_") ? "PUBLIC" : "PRIVATE";
  const credential = await db.projectCredential.findFirst({ where: { prefix: token.slice(0, 20), type, revokedAt: null }, include: { project: true } });
  if (!credential || !credential.project.enabled || !verifyCredential(token, credential.secretHash)) return null;
  await db.projectCredential.update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } });
  return { credential, project: credential.project };
}

export async function userCanManageProject(userId: string, projectId: string, roles = ["OWNER", "ADMINISTRATOR", "DEVELOPER"]) {
  const project = await db.project.findFirst({ where: { id: projectId, organization: { memberships: { some: { userId, role: { in: roles as never[] } } } } }, select: { id: true, organizationId: true } });
  return project;
}

export function sameOriginAllowed(request: Request) {
  const origin = request.headers.get("origin");
  const appUrl = process.env.APP_URL;
  if (!origin || !appUrl) return process.env.NODE_ENV !== "production";
  try { return new URL(origin).origin === new URL(appUrl).origin; } catch { return false; }
}
