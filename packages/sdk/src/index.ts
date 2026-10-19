export interface MailBridgeOptions { publicKey: string; baseUrl?: string; fetcher?: typeof fetch; }
export interface SendEmailOptions { projectId: string; templateId: string; to: string[]; variables?: Record<string, string | number | boolean | null>; idempotencyKey?: string; }
export interface SendEmailResult { success: true; message_id: string; status: "queued" | "accepted"; request_id?: string; }
export class MailBridgeError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number, public readonly requestId?: string) {
    super(message); this.name = "MailBridgeError";
  }
}
export class MailBridge {
  private readonly publicKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  constructor(options: MailBridgeOptions) {
    if (!options.publicKey || !options.publicKey.startsWith("mb_pub_")) throw new Error("A MailBridge public key (mb_pub_...) is required. Private credentials must never be used in browser code.");
    this.publicKey = options.publicKey;
    this.baseUrl = (options.baseUrl ?? "https://mailbridge.example").replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
  }
  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    if (!options.projectId || !options.templateId) throw new Error("projectId and templateId are required");
    if (!Array.isArray(options.to) || options.to.length !== 1) throw new Error("Browser credentials support exactly one explicitly allowlisted recipient per request");
    const response = await this.fetcher(this.baseUrl + "/api/v1/email/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + this.publicKey,
        ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {})
      },
      body: JSON.stringify({ project_id: options.projectId, template_id: options.templateId, to: options.to, variables: options.variables ?? {} })
    });
    const body = await response.json().catch(() => ({})) as { success?: boolean; message_id?: string; status?: string; request_id?: string; error?: { code?: string; message?: string } };
    if (!response.ok || !body.success || !body.message_id || !["queued", "accepted"].includes(body.status ?? "")) {
      throw new MailBridgeError(body.error?.code ?? "REQUEST_FAILED", body.error?.message ?? "MailBridge request failed", response.status, body.request_id ?? response.headers.get("x-request-id") ?? undefined);
    }
    return { success: true, message_id: body.message_id, status: body.status as "queued" | "accepted", request_id: body.request_id };
  }
}
