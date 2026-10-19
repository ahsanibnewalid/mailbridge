# Delivery worker

Run with `npm run worker` after applying the Prisma schema and configuring the database and provider encryption key. The worker claims PostgreSQL jobs using a conditional update, records each attempt, and applies bounded exponential backoff with jitter.

The worker currently supports the Resend adapter. Queued message payloads and provider configuration must be encrypted with the application encryption key. Do not log provider keys or message bodies. Provider acceptance is recorded as `ACCEPTED`, not `DELIVERED`; delivery requires verified provider webhooks.

Operational caveat: provider API acceptance can be ambiguous if a process crashes between the provider response and database commit. The initial worker does not yet implement provider-specific idempotency keys or a full stale-lease reconciliation workflow. Do not claim exactly-once delivery.
