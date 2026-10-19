# API contract

The public API is versioned under `/api/v1`. OpenAPI is intended to be published alongside the implementation; this document records the initial contract.

## Send email

`POST /api/v1/email/send`

Headers:
- `Authorization: Bearer <project credential>`
- `Content-Type: application/json`
- `Idempotency-Key: <unique value>` (recommended; required for retry-safe client behavior)

Example request:

```json
{
  "project_id": "prj_example",
  "template_id": "welcome",
  "to": ["verified-recipient@example.com"],
  "variables": {
    "from_name": "Example User",
    "message": "Hello from MailBridge"
  }
}
```

Accepted response (only after the durable job has committed):

```json
{
  "success": true,
  "message_id": "msg_example",
  "status": "queued",
  "request_id": "req_example"
}
```

A queued response does not mean a provider accepted the message or that it reached the recipient.

## Status semantics

- `queued`: persisted for worker processing.
- `accepted`: provider accepted the request.
- `delivered`: provider reported delivery, when supported.
- `bounced`: provider reported a bounce.
- `rejected`: policy or provider permanently rejected the message.
- `failed`: terminal failure after classification/retry policy.
- `unknown`: outcome cannot be established, for example a timeout after the provider may have accepted the request.

## Error envelope

```json
{
  "success": false,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "The project has reached its current sending quota."
  },
  "request_id": "req_example"
}
```

Never return provider credentials, stack traces, internal SQL errors, or private message content in an error response.

## Additional implemented endpoints

- `GET/POST /api/v1/projects` — list accessible projects or create one in an owned/administered organization.
- `GET/POST /api/v1/projects/{projectId}/credentials` — list key metadata or create a public/private credential; the full key is returned once.
- `GET/POST /api/v1/projects/{projectId}/origins` — manage exact browser origins.
- `GET/POST /api/v1/projects/{projectId}/recipients` — manage explicit recipient allowlists for browser sends.
- `GET/POST /api/v1/projects/{projectId}/providers` — connect Resend with encrypted credentials after checking the provider key and verified sender domain.
- `GET/POST /api/v1/projects/{projectId}/templates` — list or create draft templates.
- `POST /api/v1/templates/{templateId}/publish` — create a version snapshot and publish the template.
- `GET /api/v1/projects/{projectId}/messages` — list delivery metadata and attempts.
- `GET /api/v1/projects/{projectId}/usage` — read actual monthly quota usage.

The browser SDK only accepts `mb_pub_` keys and supports one explicitly allowlisted recipient per request. Public credentials require an exact `Origin` allowlist; origin checks are not authentication. The send API returns HTTP 202 with `status: queued` only after durable job insertion. The worker's `accepted` state is not a delivery confirmation. Provider webhooks and verified delivery-event handling are not implemented yet.
