# MailBridge threat model

## Assets

Account credentials and sessions; provider API keys; private project credentials; sender identities; recipient addresses; template content; delivery metadata; quotas; tenant data; webhook signing secrets; encryption keys.

## Trust boundaries

1. Public internet to web/API.
2. Browser SDK/public credential to project send policy.
3. Authenticated user to organization/project authorization.
4. Application to PostgreSQL.
5. Worker to email provider.
6. Provider webhook to event processing.
7. Deployment secret store to application runtime.

## Threats and required mitigations

| Threat | Mitigation |
| --- | --- |
| Credential theft | Hash private project keys; show once; encrypt provider secrets with an external 32-byte key; rotate and revoke credentials. |
| Cross-tenant data access | Enforce ownership/membership filters on every query; test negative access cases. |
| Browser key abuse/open relay | Public key has a separate permission scope, strict quotas, origin allowlist, and destination/sender policies; never permit arbitrary provider or admin access. Origin/CORS is not authentication. |
| Account enumeration/brute force | Generic auth responses, rate limiting, Argon2id, verification flows, and bounded reset attempts. |
| CSRF/session theft | HttpOnly, Secure in production, SameSite cookies, CSRF/origin validation on mutations, session revocation. |
| Template injection/XSS | Logic-light template engine, escape HTML by default, reject dangerous headers, avoid arbitrary evaluation. |
| Duplicate sends | Transactional idempotency record, unique constraint, durable job, provider idempotency where supported. |
| Quota races | Atomic quota reservation in a transaction; never rely on dashboard-only checks. |
| Forged webhook | Verify raw-body signature/timestamp using provider's official method; deduplicate provider event IDs. |
| Secret leakage | Structured logs with redaction; no request-body logging by default; scan commits and CI artifacts. |
| Spam/phishing | Verified sender/domain, recipient policy, per-account/project/IP limits, abuse monitoring, suspension and audit trail. |
| Database/worker failure | Durable jobs, leases, bounded retries, dead-letter state, health checks, backup/restore tests. |

## Security release gates

- Automated tests prove public credentials cannot access private/admin endpoints.
- Automated tests prove cross-project provider/template/message access is denied.
- Provider credentials and session tokens never appear in API responses or logs.
- Webhook signature and duplicate-event tests pass.
- Quota and idempotency behavior is safe under concurrent requests.
- HTTPS, secure cookies, secret management, backups, retention, and incident response are configured for production.

This is a threat model, not a certification or claim that the system is fully secure. A professional security review is required before high-volume or sensitive production use.
