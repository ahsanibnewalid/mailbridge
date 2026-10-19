# @mailbridge/sdk

Browser-safe SDK for the MailBridge API. Only use a public project credential in browser code. Never include private project keys or provider credentials in frontend bundles.

```ts
import { MailBridge } from "@mailbridge/sdk";
const mailbridge = new MailBridge({ publicKey: "YOUR_PUBLIC_KEY", baseUrl: "https://your-mailbridge-host.example" });
await mailbridge.send({ projectId: "YOUR_PROJECT_ID", templateId: "welcome", to: ["authorized-recipient@example.com"], variables: { first_name: "Sam" } });
```

The current server send endpoint intentionally returns `SENDING_NOT_CONFIGURED` until authorization, quota enforcement, idempotency, and durable queue insertion are implemented. Do not treat this SDK as a working production sender yet.
