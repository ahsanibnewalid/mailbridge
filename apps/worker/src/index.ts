import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { Resend } from "resend";
import { decryptSecret } from "../../web/src/lib/crypto";

const db = new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
const pollMs = Math.max(250, Number(process.env.WORKER_POLL_INTERVAL_MS || 1000));
const maxAttempts = Math.min(10, Math.max(1, Number(process.env.WORKER_MAX_ATTEMPTS || 5)));
let stopping = false;

type Payload = { to: string[]; subject: string; html: string; text?: string; from: string };
function monthStart(date: Date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)); }
function retryDelay(attempt: number) { const base = Math.min(60 * 60_000, 1000 * 2 ** Math.min(attempt, 10)); return Math.floor(base * (0.75 + Math.random() * 0.5)); }
function providerErrorCode(error: unknown) { return error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 0; }


async function recoverStaleJobs() {
  const cutoff = new Date(Date.now() - 5 * 60_000);
  const stale = await db.deliveryJob.findMany({ where: { status: "PROCESSING", lockedAt: { lt: cutoff } }, select: { id: true, messageId: true } });
  for (const item of stale) {
    await db.$transaction(async tx => {
      const changed = await tx.deliveryJob.updateMany({ where: { id: item.id, status: "PROCESSING", lockedAt: { lt: cutoff } }, data: { status: "DEAD", lockedAt: null, lockToken: null, lastError: "DELIVERY_OUTCOME_UNKNOWN" } });
      if (changed.count !== 1) return;
      await tx.emailMessage.updateMany({ where: { id: item.messageId, status: { in: ["QUEUED", "ACCEPTED"] } }, data: { status: "UNKNOWN", errorCode: "DELIVERY_OUTCOME_UNKNOWN" } });
      await tx.auditEvent.create({ data: { action: "delivery.stale_job_quarantined", resourceType: "EmailMessage", resourceId: item.messageId, metadata: { reason: "worker_lease_expired" } } });
    });
  }
}

async function processOne() {
  await recoverStaleJobs();
  const now = new Date();
  const candidate = await db.deliveryJob.findFirst({ where: { status: "PENDING", runAt: { lte: now } }, orderBy: { runAt: "asc" }, select: { id: true } });
  if (!candidate) return false;
  const lockToken = randomUUID();
  const claim = await db.deliveryJob.updateMany({ where: { id: candidate.id, status: "PENDING", runAt: { lte: now } }, data: { status: "PROCESSING", lockedAt: now, lockToken, attempts: { increment: 1 } } });
  if (claim.count !== 1) return true;
  const job = await db.deliveryJob.findUnique({ where: { id: candidate.id }, include: { message: { include: { provider: true } } } });
  if (!job || job.lockToken !== lockToken) return true;
  const attemptNumber = job.attempts;
  const attempt = await db.deliveryAttempt.create({ data: { messageId: job.messageId, attemptNumber } });
  try {
    const provider = job.message.provider;
    if (!provider || !provider.enabled || provider.provider !== "resend") throw Object.assign(new Error("No enabled Resend provider is configured"), { statusCode: 400 });
    if (!job.message.payloadEncrypted) throw Object.assign(new Error("Message payload is missing"), { statusCode: 400 });
    const payload = JSON.parse(decryptSecret(job.message.payloadEncrypted)) as Payload;
    if (!Array.isArray(payload.to) || payload.to.length < 1 || !payload.subject || !payload.html || !payload.from) throw Object.assign(new Error("Queued payload is invalid"), { statusCode: 400 });
    const providerConfig = JSON.parse(decryptSecret(provider.encryptedCredentials)) as { apiKey?: string };
    if (!providerConfig.apiKey) throw Object.assign(new Error("Provider API key is missing"), { statusCode: 400 });
    const resend = new Resend(providerConfig.apiKey);
    const result = await resend.emails.send({ from: payload.from, to: payload.to, subject: payload.subject, html: payload.html, ...(payload.text ? { text: payload.text } : {}) });
    if (result.error || !result.data?.id) throw Object.assign(new Error(result.error?.name || "Provider rejected the request"), { statusCode: 502 });
    await db.$transaction([
      db.emailMessage.update({ where: { id: job.messageId }, data: { status: "ACCEPTED", providerMessageId: result.data.id, errorCode: null } }),
      db.deliveryAttempt.update({ where: { id: attempt.id }, data: { providerStatus: "accepted", finishedAt: new Date() } }),
      db.deliveryJob.update({ where: { id: job.id, lockToken }, data: { status: "COMPLETED", lockedAt: null, lockToken: null, lastError: null } }),
      db.usageRecord.updateMany({ where: { projectId: job.message.projectId, periodStart: monthStart(job.message.createdAt) }, data: { accepted: { increment: job.message.recipientCount } } }),
      db.auditEvent.create({ data: { organizationId: undefined, action: "delivery.provider_accepted", resourceType: "EmailMessage", resourceId: job.messageId, requestId: job.message.requestId, metadata: { provider: provider.provider } } })
    ]);
  } catch (error) {
    const code = providerErrorCode(error);
    const permanent = code >= 400 && code < 500 && code !== 408 && code !== 429;
    const terminal = permanent || attemptNumber >= maxAttempts;
    const safeCode = permanent ? "PROVIDER_REJECTED" : code === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_TEMPORARY_ERROR";
    const retryAt = new Date(Date.now() + retryDelay(attemptNumber));
    const safeMessage = error instanceof Error ? error.message.slice(0, 300) : "Unknown provider error";
    await db.$transaction([
      db.emailMessage.update({ where: { id: job.messageId }, data: { status: terminal ? (permanent ? "REJECTED" : "FAILED") : "QUEUED", errorCode: safeCode } }),
      db.deliveryAttempt.update({ where: { id: attempt.id }, data: { errorCode: safeCode, errorMessage: safeMessage, finishedAt: new Date() } }),
      db.deliveryJob.update({ where: { id: job.id, lockToken }, data: { status: terminal ? "DEAD" : "PENDING", runAt: terminal ? now : retryAt, lockedAt: null, lockToken: null, lastError: safeCode } }),
      ...(terminal ? [db.usageRecord.updateMany({ where: { projectId: job.message.projectId, periodStart: monthStart(job.message.createdAt) }, data: { failed: { increment: job.message.recipientCount } } })] : [])
    ]);
  }
  return true;
}

async function main() {
  console.info(JSON.stringify({ event: "worker.started", pollMs, maxAttempts }));
  while (!stopping) {
    try { const worked = await processOne(); if (!worked) await new Promise(resolve => setTimeout(resolve, pollMs)); }
    catch (error) { console.error(JSON.stringify({ event: "worker.loop_error", message: error instanceof Error ? error.message : "unknown" })); await new Promise(resolve => setTimeout(resolve, pollMs)); }
  }
  await db.$disconnect();
}
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
main().catch(error => { console.error(JSON.stringify({ event: "worker.fatal", message: error instanceof Error ? error.message : "unknown" })); process.exitCode = 1; });
