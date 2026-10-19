# Security implementation notes

- Provider secrets are encrypted using AES-256-GCM with a 12-byte random IV and authentication tag. `PROVIDER_ENCRYPTION_KEY_BASE64` must decode to 32 bytes and must be held outside PostgreSQL. Losing this key prevents decryption.
- Project credentials are intended to be generated with high entropy and stored as SHA-256 hashes. Because these keys are random machine credentials rather than human passwords, a fast hash is appropriate; passwords must use Argon2id.
- Template interpolation uses Handlebars' HTML escaping by default and accepts primitive variables only. Raw triple-brace interpolation should not be used with untrusted input.
- The send endpoint intentionally fails closed until credential authorization, tenant isolation, quota reservation, idempotency, and durable queue insertion are implemented together.
- These helpers are not a substitute for end-to-end authorization tests, rate limiting, key rotation procedures, or an independent security review.
