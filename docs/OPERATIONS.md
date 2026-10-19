# Operations runbook

## Required production services

- Node.js container for the Next.js web/API application.
- Separate persistent Node.js worker process for durable delivery jobs.
- PostgreSQL with encrypted connections, automated backups, and restricted network access.
- Transactional email provider account with verified sender/domain.
- Secret manager or equivalent for database credentials and provider-encryption key.

Redis is not required by the initial architecture. Do not deploy the worker on a platform that suspends it between requests.

## Health and release checks

Before release, add and verify liveness and readiness endpoints. Readiness must fail when required dependencies such as PostgreSQL are unavailable. Check CI for lint, typecheck, automated tests, and production build before deploying.

## Secrets and rotation

1. Create a new provider API key or application encryption key in the provider/secret manager.
2. Deploy the new value using the documented rotation procedure.
3. Verify sending and decryptability of stored provider configurations.
4. Revoke the old provider key only after the transition is confirmed.
5. Back up encryption keys separately from the database. Losing the provider encryption key can make stored provider credentials unrecoverable.

Private project credentials should be revocable and replaced without exposing existing values.

## Backup and restore

Use managed PostgreSQL point-in-time recovery or scheduled encrypted backups. Periodically restore into an isolated environment, run migrations, and verify counts/integrity of critical records. Do not restore production data into an unsecured development environment.

## Incident response

- Suspend compromised accounts/projects and revoke credentials.
- Preserve audit events and relevant request IDs.
- Rotate provider and application secrets as indicated.
- Review provider logs for unauthorized activity.
- Notify affected parties according to applicable obligations.
- Record remediation and add regression tests.

## Troubleshooting

- **Queued but not sent:** verify worker is running, database connectivity, due-job state, and worker logs.
- **Provider rejects sender:** verify the sender/domain is authorized by the provider.
- **Webhook state not updated:** verify webhook URL, raw-body signature verification, timestamp tolerance, and provider event configuration.
- **Unexpected quota errors:** inspect the quota window and reservation records; do not manually edit usage without an audited correction.
