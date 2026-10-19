# Deployment

MailBridge requires a Node.js runtime, PostgreSQL, and a persistent worker process for reliable asynchronous delivery. A static host such as GitHub Pages cannot run the API or worker.

## Container build

Build with Docker using a build-only DATABASE_URL and a non-production encryption key for Prisma generation. The production runtime must receive its own DATABASE_URL, PROVIDER_ENCRYPTION_KEY_BASE64, APP_URL, and provider credentials from a secret manager. Never reuse the Docker build-time placeholder key for real data.

The current Dockerfile starts the Next.js web service. The worker must be deployed as a separate process using the same image with command `npm run worker`, after the worker implementation is released. Do not route production traffic to this foundation until database migrations, authentication, sending authorization, quota checks, worker retry handling, webhook verification, and smoke tests are complete.

## Release gate

1. Run CI successfully on the release commit.
2. Apply version-controlled Prisma migrations against a backup/staging database.
3. Verify readiness, registration, provider setup, and a test send to an authorized recipient.
4. Verify delivery logs and provider webhook events.
5. Test restore and rollback before production cutover.
