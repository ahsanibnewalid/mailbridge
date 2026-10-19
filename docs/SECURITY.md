# Security implementation notes

## Implemented controls

- Passwords are hashed with Argon2id; session tokens and email verification/password-reset tokens are opaque random values stored as SHA-256 hashes.
- Session cookies are HttpOnly, SameSite=Lax, and Secure in production. Password reset revokes active sessions and invalidates outstanding reset tokens.
- Provider credentials and queued email payloads are encrypted with AES-256-GCM using a 32-byte key supplied through `PROVIDER_ENCRYPTION_KEY_BASE64`.
- Project credentials are high-entropy random keys stored as hashes. They are shown once, can be revoked, and public credentials are limited to one recipient per request with exact project-scoped origin and recipient allowlists.
- Send requests enforce a 32 KB UTF-8 body limit, per-credential rate limits, monthly quotas, idempotency keys, project isolation, and durable queue insertion.
- HTML template variables are escaped by default. Raw triple-brace interpolation is rejected when creating or publishing templates; subject control characters are rejected.
- Resend webhook events require Svix signature verification and are deduplicated by provider event ID.
- Delivery worker retries are bounded and use backoff with jitter. Expired worker leases are quarantined as UNKNOWN instead of blindly resending an email whose provider outcome may be ambiguous.
- Standard response security headers and a restrictive Content Security Policy are configured in Next.js.

## Important limitations and release gates

- Resend is the only implemented delivery provider. A successful provider API response means accepted, not delivered.
- Real end-to-end delivery, webhook behavior, deployment configuration, restore procedures, and tenant-isolation behavior still require staging tests with real infrastructure and credentials.
- Rate limiting currently uses PostgreSQL counters. Reverse-proxy client-IP headers must be configured to be overwritten by a trusted proxy; per-account and per-credential limits provide additional protection.
- Do not expose private credentials to browsers. Public origin checks are defense-in-depth, not authentication.
- Keep the encryption key outside PostgreSQL, back it up securely, and test recovery. Losing it makes encrypted provider credentials and queued payloads unreadable.
- Review dependency advisories, run the full CI workflow, test restore and rollback, and obtain an independent security review before production use.

This document describes implemented safeguards; it is not a certification or a substitute for production verification.
