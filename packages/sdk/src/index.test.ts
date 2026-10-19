import { describe, expect, it, vi } from "vitest";
import { MailBridge, MailBridgeError } from "./index";

describe("MailBridge browser SDK", () => {
  it("refuses private credentials in browser clients", () => {
    expect(() => new MailBridge({ publicKey: "mb_priv_abcdefghijklmnopqrstuvwxyz0123456789" })).toThrow(/must never be used in browser code/);
  });
  it("sends only one recipient with the public credential", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer mb_pub_abcdefghijklmnopqrstuvwxyz0123456789");
      return new Response(JSON.stringify({ success: true, message_id: "msg_1", status: "queued" }), { status: 202 });
    });
    const client = new MailBridge({ publicKey: "mb_pub_abcdefghijklmnopqrstuvwxyz0123456789", baseUrl: "https://mailbridge.test/", fetcher });
    const result = await client.send({ projectId: "p1", templateId: "welcome", to: ["allowed@example.com"] });
    expect(result.status).toBe("queued");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe("https://mailbridge.test/api/v1/email/send");
  });
  it("rejects multi-recipient browser sends", async () => {
    const client = new MailBridge({ publicKey: "mb_pub_abcdefghijklmnopqrstuvwxyz0123456789", fetcher: fetch });
    await expect(client.send({ projectId: "p", templateId: "t", to: ["a@example.com", "b@example.com"] })).rejects.toThrow(/exactly one/);
  });
  it("normalizes API errors", async () => {
    const fetcher = async () => new Response(JSON.stringify({ success: false, error: { code: "QUOTA_EXCEEDED", message: "Quota reached" }, request_id: "req_1" }), { status: 429 });
    const client = new MailBridge({ publicKey: "mb_pub_abcdefghijklmnopqrstuvwxyz0123456789", fetcher });
    await expect(client.send({ projectId: "p", templateId: "t", to: ["a@example.com"] })).rejects.toBeInstanceOf(MailBridgeError);
  });
});
