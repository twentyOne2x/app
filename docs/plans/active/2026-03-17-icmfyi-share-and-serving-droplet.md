# Objective

Restore visible chat sharing in the app and stand up a minimal always-on serving stack for `icm.fyi` on a new DigitalOcean droplet:
- `qdrant` for remote vector storage
- `rag` FastAPI for client-serving chat requests

# Non-goals

- Moving ingestion, transcript extraction, or video indexing off the local machine
- Reworking the retrieval pipeline itself beyond what is needed for deployment
- Rebuilding the Vercel frontend from this dirty worktree without reviewing unrelated edits

# Constraints / Non-negotiables

- Do not revert unrelated user changes in the `app` worktree.
- Keep secrets out of repo files and rely on the shared env file for API keys and OAuth secrets.
- The serving droplet must run only the online serving tier, not ingestion/indexing jobs.
- Preserve persistent Qdrant storage so local indexing can push once and the service stays online.

# Step-by-step plan

1. Inspect the current share control rendering path and patch the home/index chat entrypoint to use the same header extras mechanism as the dedicated chat page.
2. Run focused verification for sharing, at minimum static checks plus the existing share-flow regression test if the local harness supports it.
3. Inspect the `rag` runtime requirements for Qdrant-backed serving and extract the minimum env/config surface required on a fresh host.
4. Bootstrap the new droplet:
   - install Docker and Compose plugin
   - create an app directory with a serving-only compose stack
   - configure persistent Qdrant storage and a durable env file
5. Deploy `qdrant` and `rag`, verify `/healthz`, `/channels`, and a sample `/chat` request.
6. Record the droplet topology, env contract, and Vercel cutover steps in repo docs.

# Verification plan

Commands / proofs:
- `pnpm lint`
- `pnpm type-check`
- focused share-flow test if feasible (`pnpm exec playwright test tests/e2e/share-flow.spec.ts`)
- `curl http://<droplet-ip>:6333/healthz`
- `curl http://<droplet-ip>:8000/healthz` or proxy equivalent
- sample `/chat` request against the droplet-backed `rag` service
- `docker ps` and `docker logs` on the droplet

Expected artifacts:
- Share button is rendered again for active signed-in chats.
- DO droplet shows healthy `qdrant` and `rag` containers.
- Qdrant uses a persistent host volume.
- Repo docs explain how local indexing should target the remote Qdrant URL.

# Rollback / Recovery

- If the share UI patch regresses the header, revert only that page-level change.
- If the droplet deployment fails, keep the host but stop containers and preserve the Qdrant volume for re-provisioning.
- Do not switch Vercel production over until the new backend passes health checks.

# Decision log

- 2026-03-17: Treat as `large` because it spans frontend behavior, infra provisioning, and runtime documentation.
- 2026-03-17: Use a dedicated serving droplet rather than reusing `attn-markets-data-1` to keep the online chat surface isolated from unrelated workloads.
- 2026-03-17: Keep the serving tier to `qdrant + rag` only; indexing remains local and will target the remote Qdrant instance.

# Progress log

- 2026-03-17: Confirmed share actions, share routes, and shared-chat rendering still exist in the app.
- 2026-03-17: Confirmed the index page is the outlier in how it renders the share control versus the dedicated chat page.
- 2026-03-17: Created DigitalOcean droplet `icm-serving-1` (`138.197.118.163`) for the new serving tier.
- 2026-03-17: Installed Docker Engine and Compose plugin on `icm-serving-1`, created `/opt/icm-serving`, and restricted inbound access with DO firewall `icm-serving-fw` (`22` + `6333` only from `92.184.104.249/32`; `8000` public).
- 2026-03-17: Generated a dedicated remote Qdrant API key and stored the serving connection details in the shared env as `ICM_REMOTE_QDRANT_API_KEY`, `ICM_SERVING_DROPLET_IP`, `ICM_REMOTE_QDRANT_URL`, and `ICM_REMOTE_RAG_URL`.
- 2026-03-17: Captured live local Qdrant state for migration: `icmfyi-v2__videos` has `149161` points and `icmfyi-v2__streams` has `7778` points.
- 2026-03-17: Avoided a wasteful remote rebuild after `sentence-transformers` pulled the full CUDA PyTorch wheel stack on the CPU droplet; switched to loading the already-working local `icmfyi-rag:latest` image onto the host instead.
- 2026-03-17: App-side share restoration is patched in `app/page.tsx` and verified with lint, type-check, and the focused Playwright share-flow regression.
- 2026-03-17: Completed a cached remote `rag` rebuild on the droplet after the first build had already populated the pip cache; `qdrant` and `rag` containers now start from `/opt/icm-serving/compose.yml`.
- 2026-03-17: Verified `rag` `/healthz` on the droplet once `UVICORN_WORKERS` was reduced from `2` to `1`; this avoids a Qdrant collection-creation race during multi-worker startup.
- 2026-03-17: Created local collection snapshots for migration, but full remote restore remains pending because moving multi-gigabyte snapshot data from this workstation to the droplet is the active bottleneck.
