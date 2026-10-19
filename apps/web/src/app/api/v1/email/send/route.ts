import { createHash, randomUUID } from "node:crypto";
import Handlebars from "handlebars";
import { z } from "zod";
import { apiError, apiSuccess, requestId } from "@/lib/http";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { validateTemplateVariables } from "@/lib/template";
import { authenticateProjectCredential } from "@/lib/project-auth";
import { checkFixedRateLimit } from "@/lib/rate-limit";

const schema = z.object({ project_id: z.string().min(1).max(100), template_id: z.string().min(1).max(100), to: z.array(z.string().email().max(254)).min(1).max(5), variables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}) }).strict();
function monthStart(date: Date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)); }
function err(status: number, code: string, message: string, id: string) { return apiError(status, code, message, id); }
async function handleSend(request: Request) {
  const id = requestId(request);
  let rawBody: string;
  try { rawBody = await request.text(); } catch { return err(400, "INVALID_REQUEST", "Request body could not be read.", id); }
  if (Buffer.byteLength(rawBody, "utf8") > 32_000) return err(413, "REQUEST_TOO_LARGE", "Request body exceeds 32 KB.", id);
  let body;
  try { body = schema.safeParse(JSON.parse(rawBody)); } catch { body = null; }
  if (!body || !body.success) return err(400, "INVALID_REQUEST", "Provide a valid project_id, template_id, recipients, and primitive template variables.", id);
  const auth = await authenticateProjectCredential(request).catch(() => null);
  if (!auth || auth.project.id !== body.data.project_id || !auth.credential.permissions.includes("email:send")) return err(401, "INVALID_CREDENTIAL", "The credential is invalid or is not authorized for this project.", id);
  if (!(await checkFixedRateLimit(auth.credential.id, "email-send", 60, 60_000))) return err(429, "RATE_LIMITED", "This credential has reached the sending rate limit. Try again shortly.", id);
  const isPublic = auth.credential.type === "PUBLIC";
  if (isPublic) {
    const origin = request.headers.get("origin");
    const originRecord = origin ? await db.allowedOrigin.findFirst({ where: { projectId: auth.project.id, origin } }) : null;
    if (!originRecord) return err(403, "ORIGIN_NOT_ALLOWED", "This exact browser origin is not allowlisted for the project.", id);
    if (body.data.to.length !== 1) return err(403, "PUBLIC_RECIPIENT_POLICY", "Browser credentials may send to one explicitly allowlisted recipient per request.", id);
    const allowed = await db.allowedRecipient.findFirst({ where: { projectId: auth.project.id, email: body.data.to[0].trim().toLowerCase() } });
    if (!allowed) return err(403, "RECIPIENT_NOT_ALLOWED", "This recipient has not been explicitly allowlisted for browser sending.", id);
  }
  const recipients = body.data.to.map(value => value.trim().toLowerCase());
  if (new Set(recipients).size !== recipients.length) return err(400, "DUPLICATE_RECIPIENT", "Recipient addresses must be unique.", id);
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey && !/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey)) return err(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 8–200 safe characters.", id);
  const requestHash = createHash("sha256").update(JSON.stringify({ project_id: body.data.project_id, template_id: body.data.template_id, to: recipients, variables: body.data.variables })).digest("hex");
  if (idempotencyKey) {
    const old = await db.emailMessage.findUnique({ where: { projectId_idempotencyKey: { projectId: auth.project.id, idempotencyKey } } });
    if (old) return old.requestHash === requestHash ? apiSuccess({ success: true, message_id: old.id, status: old.status.toLowerCase(), request_id: old.requestId }, 202, id) : err(409, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different request.", id);
  }
  let variables;
  try { variables = validateTemplateVariables(body.data.variables); } catch { return err(400, "INVALID_VARIABLES", "Template variables are invalid.", id); }
  const template = await db.emailTemplate.findFirst({ where: { projectId: auth.project.id, identifier: body.data.template_id, status: "PUBLISHED" } });
  if (!template) return err(404, "TEMPLATE_NOT_FOUND", "A published template with this identifier was not found in the project.", id);
  const provider = await db.emailProviderConnection.findFirst({ where: { projectId: auth.project.id, enabled: true, provider: "resend" }, orderBy: { createdAt: "asc" } });
  if (!provider) return err(409, "PROVIDER_NOT_CONFIGURED", "Connect an enabled transactional provider before sending.", id);
  const sender = await db.senderIdentity.findFirst({ where: { projectId: auth.project.id, email: provider.defaultFromEmail, verifiedAt: { not: null } } });
  if (!sender) return err(409, "SENDER_NOT_VERIFIED", "The provider sender address must be verified in MailBridge before sending.", id);
  let subject: string, html: string, text: string | undefined;
  try {
    subject = Handlebars.compile(template.subject, { strict: true, noEscape: true })(variables);
    if (/[\r\n\x00-\x1f\x7f]/.test(subject) || subject.length > 998) return err(400, "INVALID_RENDERED_SUBJECT", "Rendered subject contains invalid header characters or is too long.", id);
    html = Handlebars.compile(template.htmlBody, { strict: true, noEscape: false })(variables);
    text = template.textBody ? Handlebars.compile(template.textBody, { strict: true, noEscape: true })(variables) : undefined;
  } catch { return err(400, "TEMPLATE_RENDER_FAILED", "The template could not be rendered with the supplied variables.", id); }
  const now = new Date(); const periodStart = monthStart(now); const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const requestUuid = randomUUID();
  let payloadEncrypted: string;
  try { payloadEncrypted = encryptSecret(JSON.stringify({ to: recipients, subject, html, text, from: provider.defaultFromName ? `${provider.defaultFromName} <${provider.defaultFromEmail}>` : provider.defaultFromEmail })); }
  catch { return err(503, "ENCRYPTION_NOT_CONFIGURED", "The platform encryption key is not configured.", id); }
  try {
    const message = await db.$transaction(async tx => {
      const project = await tx.project.findUnique({ where: { id: auth.project.id }, select: { monthlyQuota: true, enabled: true } });
      if (!project?.enabled) throw new Error("PROJECT_DISABLED");
      const usage = await tx.usageRecord.upsert({ where: { projectId_periodStart: { projectId: auth.project.id, periodStart } }, create: { projectId: auth.project.id, periodStart, periodEnd, attempted: 0 }, update: {} });
      if (usage.attempted + recipients.length > project.monthlyQuota) throw new Error("QUOTA_EXCEEDED");
      await tx.usageRecord.update({ where: { id: usage.id }, data: { attempted: { increment: recipients.length } } });
      const created = await tx.emailMessage.create({ data: { projectId: auth.project.id, templateId: template.id, providerId: provider.id, requestId: requestUuid, idempotencyKey: idempotencyKey ?? null, requestHash, recipientHash: createHash("sha256").update(recipients.join(",")).digest("hex"), recipientCount: recipients.length, subjectSnapshot: subject, payloadEncrypted, status: "QUEUED" } });
      await tx.deliveryJob.create({ data: { messageId: created.id } });
      await tx.auditEvent.create({ data: { action: "email.queued", resourceType: "EmailMessage", resourceId: created.id, requestId: requestUuid, metadata: { recipientCount: recipients.length, credentialType: auth.credential.type } } });
      return created;
    }, { isolationLevel: "Serializable" });
    return apiSuccess({ success: true, message_id: message.id, status: "queued", request_id: requestUuid }, 202, id);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "";
    if (reason === "QUOTA_EXCEEDED") return err(429, "QUOTA_EXCEEDED", "The project has reached its monthly email quota.", id);
    if (reason === "PROJECT_DISABLED") return err(403, "PROJECT_DISABLED", "This project is disabled.", id);
    if (idempotencyKey) {
      const old = await db.emailMessage.findUnique({ where: { projectId_idempotencyKey: { projectId: auth.project.id, idempotencyKey } } }).catch(() => null);
      if (old && old.requestHash === requestHash) return apiSuccess({ success: true, message_id: old.id, status: old.status.toLowerCase(), request_id: old.requestId }, 202, id);
      if (old) return err(409, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different request.", id);
    }
    return err(503, "QUEUE_UNAVAILABLE", "The message could not be queued. Retry with the same Idempotency-Key.", id);
  }
}

export async function POST(request: Request) {
  const response = await handleSend(request);
  const origin = request.headers.get("origin");
  if (origin) {
    const allowed = await db.allowedOrigin.findFirst({ where: { origin } }).catch(() => null);
    if (allowed) { response.headers.set("access-control-allow-origin", origin); response.headers.set("vary", "Origin"); }
  }
  return response;
}
export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return new Response(null, { status: 204 });
  const allowed = await db.allowedOrigin.findFirst({ where: { origin } }).catch(() => null);
  if (!allowed) return new Response(null, { status: 403, headers: { "vary": "Origin" } });
  return new Response(null, { status: 204, headers: { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "authorization, content-type, idempotency-key, x-request-id", "access-control-max-age": "600", "vary": "Origin" } });
}
