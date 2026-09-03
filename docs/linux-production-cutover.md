# Linux Production Persistence and Cutover

The target production topology is one Ubuntu appliance for the Next.js app,
ingestion, PostgreSQL, Redis, Qdrant, retrieval, clipping, and MCP, with the
existing Hetzner Storage Box as durable media custody. Vercel remains the
rollback target until the final DNS and OAuth canaries pass.

## Durable state boundary

- PostgreSQL is authoritative for saved chats and immutable share copies in
  `app_chats`. Every private read/write runs under transaction-local opaque
  `ten_...` and `usr_...` scope and forced RLS.
- A public share read sets only the exact `app.share_id`; it does not acquire a
  tenant-wide scope.
- Redis stores short rate-limit windows only. Losing Redis
  must not lose users, tenants, chats, ingestion jobs, media, transcripts, or
  payment state.
- Production must set both `APP_DATABASE_URL` and `APP_REDIS_URL`. The app
  health endpoint verifies both dependencies and fails closed.
- Process-local Maps remain development/E2E fallbacks only.

Example private service URLs:

```bash
APP_DATABASE_URL=postgresql://icmfyi_app:...@postgres:5432/icmfyi
APP_REDIS_URL=redis://:...@redis:6379/1
```

The application database role must be a fixed `icmfyi_app` login with
`NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, `NOREPLICATION`, and
`NOBYPASSRLS`. It receives DML only on `app_chats`; the migration owner retains
schema and backup authority.

## Legacy Vercel KV boundary

Older deployments stored chat hashes as `chat:<id>` and user indexes as
`user:chat:<provider-subject>`. The retained endpoint was not resolvable during
cutover inspection, so its row count and contents remain `continuity_unknown`;
that is not evidence that the store is empty. This release neither contacts nor
depends on that service and makes no history-import claim.

Do not delete the Vercel project or its storage during the rollback window. New
Linux chats begin in the authoritative PostgreSQL store. If the legacy endpoint
becomes reachable later, recovery is a separate receipt-bound import that must
establish each provider realm, derive the canonical opaque scope, and compare
item counts and payload hashes before publication.

## OAuth and DNS sequence

1. Preserve the current Vercel deployment and exact DNS records as rollback.
2. Provision a trusted certificate containing both `icm.fyi` and
   `www.icm.fyi`, then preflight the Linux appliance with `curl --resolve`.
3. Register the apex OAuth callbacks while retaining the existing `www`
   callbacks.
4. Move the apex record and prove sign-in, session continuity, saved-chat
   read/write, ingestion, query, and clip canaries.
5. Move `www` last; it permanently redirects to the same apex URI.

Rollback reverses the DNS order (`www`, then apex) and leaves the PostgreSQL
state intact for reconciliation. Never infer provider callback registration
from a successful HTTP health probe.

## Required production configuration

Alongside provider credentials, set at least:

```bash
NEXTAUTH_URL=https://icm.fyi
NEXTAUTH_SECRET=...
ICMFYI_IDENTITY_HMAC_SECRET=...
APP_DATABASE_URL=postgresql://icmfyi_app:...@postgres:5432/icmfyi
APP_REDIS_URL=redis://:...@redis:6379/1
RAG_SERVICE_URL=http://rag:8080
INGESTION_SERVICE_URL=http://ingestion-api:8080
CLIP_SERVICE_URL=http://clip-service:8080
INTERNAL_SERVICE_SECRET=...
```

Provider callback URLs and the MCP OAuth issuer/audience/JWKS contract remain
separate external gates. Secrets stay outside Git and release receipts.
