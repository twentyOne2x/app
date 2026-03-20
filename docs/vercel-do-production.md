# Vercel + DigitalOcean Production Split

This app is intended to run as a split deployment:

- Vercel for the Next.js frontend in `/Users/user/PycharmProjects/icmfyi/app`
- A DigitalOcean droplet for the backend services in `/Users/user/PycharmProjects/icmfyi/rag` and, when needed, `/Users/user/PycharmProjects/icmfyi/ingestion` and `/Users/user/PycharmProjects/icmfyi/clip-service`

## Serving-Only Mode

For the current `icm.fyi` recovery, the desired production shape is narrower:

- local machine: ingestion, transcript extraction, and video indexing
- DigitalOcean droplet: `qdrant` plus the `rag` FastAPI service only
- Vercel: Next.js frontend only

As of 2026-03-17, the serving droplet is:

- Name: `icm-serving-1`
- Region: `nyc3`
- Public IPv4: `138.197.118.163`
- Size: `s-2vcpu-4gb`

The current firewall shape on that droplet is:

- TCP `22`: limited to operator IP `92.184.104.249/32`
- TCP `6333`: limited to operator IP `92.184.104.249/32`
- TCP `8000`: public for the RAG API
- TCP `80/443`: reserved for future TLS termination

## Frontend on Vercel

Create a Vercel project rooted at `/Users/user/PycharmProjects/icmfyi/app` and set at least:

```bash
NEXTAUTH_URL=https://icm.fyi
NEXTAUTH_SECRET=...
TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
RAG_SERVICE_URL=https://<do-backend-domain-or-ip>
NEXT_PUBLIC_RAG_API_URL=https://<do-backend-domain-or-ip>
REACT_APP_BACKEND_URL=https://<do-backend-domain-or-ip>
INGESTION_SERVICE_URL=https://<do-ingestion-domain-or-ip>
CLIP_SERVICE_URL=https://<do-clip-domain-or-ip>
CHAT_PREVIEW_MESSAGE_LIMIT=3
CHAT_RATE_LIMIT_WINDOW_SECONDS=60
CHAT_RATE_LIMIT_ANON_MAX=6
CHAT_RATE_LIMIT_AUTH_MAX=20
```

Notes:

- Vercel KV is required in production so chat persistence, anonymous preview counting, and route rate limits survive serverless instance churn.
- Twitter and Google OAuth callback URLs must point at the Vercel domain (or the final custom domain).
- If preview deployments use OAuth, set `AUTH_REDIRECT_PROXY_URL` per Auth.js guidance.

## Backend on a DigitalOcean Droplet

Use the existing backend codepaths already present in this workspace:

- RAG API: `/Users/user/PycharmProjects/icmfyi/rag`
- Optional ingestion API: `/Users/user/PycharmProjects/icmfyi/ingestion`
- Optional clip generation service: `/Users/user/PycharmProjects/icmfyi/clip-service`

Recommended droplet shape:

- Ubuntu 24.04 LTS
- Docker Engine + Compose plugin
- Caddy or Nginx for TLS termination
- 2+ vCPU, 4+ GB RAM for a basic RAG-only footprint

Minimum RAG environment:

```bash
OPENAI_API_KEY=...
VECTOR_STORE=qdrant
PINECONE_INDEX_NAME=icmfyi-v2
PINECONE_NAMESPACE=videos
QDRANT_API_KEY=...
QDRANT_COLLECTION_TEMPLATE={index}__{namespace}
APP_ORIGINS=https://www.icm.fyi,https://icm.fyi
UVICORN_WORKERS=1
RAG_ENGINE_POOL_SIZE=2
RAG_ENGINE_ACQUIRE_TIMEOUT=45
```

Serving-only compose pattern:

```bash
services:
  qdrant:
    image: qdrant/qdrant@sha256:f1c7272cdac52b38c1a0e89313922d940ba50afd90d593a1605dbbc214e66ffb
    restart: unless-stopped
    env_file:
      - ./.env
    environment:
      QDRANT__SERVICE__API_KEY: ${QDRANT_API_KEY}
    volumes:
      - /opt/icm-serving/data/qdrant:/qdrant/storage
    ports:
      - "6333:6333"

  rag:
    image: icmfyi-rag:latest
    restart: unless-stopped
    depends_on:
      - qdrant
    env_file:
      - ./.env
    environment:
      VECTOR_STORE: ${VECTOR_STORE:-qdrant}
      QDRANT_URL: http://qdrant:6333
      QDRANT_API_KEY: ${QDRANT_API_KEY}
      QDRANT_COLLECTION_TEMPLATE: ${QDRANT_COLLECTION_TEMPLATE:-{index}__{namespace}}
    ports:
      - "8000:8080"
```

Notes:

- Keep the droplet env file outside the repo. In this workspace, the remote Qdrant connection details are stored in the shared env as `ICM_REMOTE_QDRANT_API_KEY`, `ICM_SERVING_DROPLET_IP`, `ICM_REMOTE_QDRANT_URL`, and `ICM_REMOTE_RAG_URL`.
- Seed the droplet from the existing local data rather than starting from an empty collection. On 2026-03-17, the local collections contained `149161` points in `icmfyi-v2__videos` and `7778` points in `icmfyi-v2__streams`.
- For future local indexing runs, point the local ingestion environment at `ICM_REMOTE_QDRANT_URL` / `ICM_REMOTE_QDRANT_API_KEY` when you want fresh vectors written directly into the always-on serving store.
- Prefer `UVICORN_WORKERS=1` on this host. The app already uses its own internal query-engine pool, and running multiple Uvicorn workers caused a startup race where both workers attempted to create the same Qdrant collection.

If you need ingestion or clipping online as well, adapt the corresponding services from `/Users/user/PycharmProjects/icmfyi/docker-compose.local.yml` into a production compose file on the droplet, replacing local-only mounts and localhost origins with the droplet’s persistent volumes and the public frontend origin.

## Smoke Checks

After deploy:

```bash
curl -fsS https://<do-backend-domain-or-ip>/healthz
curl -fsS https://icm.fyi/api/chat/stream -I
```

Manual checks:

- Submit 3 anonymous prompts.
- Refresh the page.
- Confirm the 4th prompt is blocked until Twitter or Google sign-in.
- Confirm rate limiting returns a 429 when prompts are spammed rapidly.
- Confirm the header X link points to `https://x.com/twentyOne2x`.
