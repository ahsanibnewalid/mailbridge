import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
const terminal = ["DELIVERED", "BOUNCED", "REJECTED", "FAILED"] as const;
function monthStart(date: Date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)); }
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  const id = request.headers.get("svix-id"); const timestamp = request.headers.get("svix-timestamp"); const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return NextResponse.json({ error: "missing_signature_headers" }, { status: 400 });
  const raw = await request.text();
  if (raw.length > 256_000) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  let event: { type?: string; data?: { email_id?: string; id?: string } };
  try { event = new Webhook(secret).verify(raw, { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": signature }) as typeof event; }
  catch { return NextResponse.json({ error: "invalid_signature" }, { status: 401 }); }
  if (!event.type || !event.data) return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  const providerMessageId = event.data.email_id || event.data.id;
  const payloadHash = createHash("sha256").update(raw).digest("hex");
  try {
    await db.$transaction(async tx => {
      await tx.providerWebhookEvent.create({ data: { provider: "resend", eventId: id, eventType: event.type!, payloadHash } });
      if (!providerMessageId) { await tx.providerWebhookEvent.update({ where: { provider_eventId: { provider: "resend", eventId: id } }, data: { processedAt: new Date() } }); return; }
      const message = await tx.emailMessage.findFirst({ where: { provider: { provider: "resend" }, providerMessageId }, select: { id: true, projectId: true, createdAt: true, recipientCount: true, status: true } });
      if (!message) throw new Error("MESSAGE_NOT_FOUND");
      let next: "DELIVERED" | "BOUNCED" | "FAILED" | "REJECTED" | null = null;
      if (event.type === "email.delivered") next = "DELIVERED";
      else if (event.type === "email.bounced") next = "BOUNCED";
      else if (event.type === "email.failed") next = "FAILED";
      else if (event.type === "email.rejected") next = "REJECTED";
      if (next && !terminal.includes(message.status as typeof terminal[number])) {
        const changed = await tx.emailMessage.updateMany({ where: { id: message.id, status: { in: ["QUEUED", "ACCEPTED", "UNKNOWN"] } }, data: { status: next, errorCode: next === "DELIVERED" ? null : next === "BOUNCED" ? "PROVIDER_BOUNCED" : "PROVIDER_FAILED" } });
        if (changed.count === 1 && (next === "DELIVERED" || next === "BOUNCED" || next === "FAILED")) {
          await tx.usageRecord.updateMany({ where: { projectId: message.projectId, periodStart: monthStart(message.createdAt) }, data: next === "DELIVERED" ? { delivered: { increment: message.recipientCount } } : { failed: { increment: message.recipientCount } } });
        }
      }
      await tx.providerWebhookEvent.update({ where: { provider_eventId: { provider: "resend", eventId: id } }, data: { processedAt: new Date() } });
    });
    return NextResponse.json({ received: true }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ received: true, duplicate: true }, { status: 200, headers: { "cache-control": "no-store" } });
    return NextResponse.json({ error: "event_processing_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
