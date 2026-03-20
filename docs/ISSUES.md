# Issues

## 2026-03-17 - Restore `icm.fyi` deployability, gated preview access, and anti-spam controls

Type: feature / infra recovery  
Status: in_progress (code complete, live deploy blocked by existing prod wiring / clean-deploy risk)

Context:
- The app frontend is intended to run on Vercel and the retrieval backend is intended to run separately, but the repo does not currently document or enforce a clean Vercel + DigitalOcean deployment split.
- Anonymous users can submit prompts without a durable usage gate, so refreshes do not preserve the intended "authenticate after 3 inputs" rule.
- Middleware rate limiting is currently a no-op.
- The auth surface is Twitter plus Privy wallet, while the desired surface is Twitter or Google/Gmail OAuth.
- The header still links to the legacy `icmdotfyi` X account instead of `twentyOne2x`.

Suspected cause:
- Access control, rate limiting, and deployment assumptions are spread across the app with no single server-side usage ledger.
- The current auth implementation predates the requested Twitter-or-Gmail requirement.
- Infra instructions are local-dev oriented (`docker-compose.local.yml`) rather than production Vercel + DO oriented.

Fix intent:
- Add a server-side preview usage ledger and rate limiting for chat submission routes.
- Require Twitter or Google OAuth after the third anonymous input, including across page refreshes.
- Update the UI to reflect the new auth requirement and switch the public X link to `twentyOne2x`.
- Document the production split: Vercel for the Next.js app, DigitalOcean droplet for the backend services.

Acceptance criteria:
- Anonymous users can submit at most 3 prompts; the 4th prompt is blocked until they sign in with Twitter or Google.
- The auth gate survives page refreshes via server-side state, not only client local storage.
- Chat submission routes enforce anti-spam rate limits server-side.
- The sign-in page and login buttons offer Twitter and Google, not Privy wallet.
- The header X link points to `https://x.com/twentyOne2x`.
- Repo documentation explains how to run the frontend on Vercel and the backend on a DO droplet.
- Relevant lint/type/tests pass, and any deployment blockers are recorded.

Complexity: large
Plan: [docs/plans/active/2026-03-17-icmfyi-recovery-auth-gate.md](/Users/user/PycharmProjects/icmfyi/app/docs/plans/active/2026-03-17-icmfyi-recovery-auth-gate.md)

Executor prompt:
- Update the Next.js app under `/Users/user/PycharmProjects/icmfyi/app` to add durable anonymous usage tracking and chat rate limiting, replace Privy-facing auth UX with Twitter + Google OAuth, update social links, and document Vercel frontend + DO backend deployment.
- Prefer server-side enforcement in route handlers over client-only checks.
- Avoid reverting existing unrelated user changes in the dirty worktree.
- Run the relevant checks (`python scripts/knowledge_check.py`, lint, type-check, focused tests) and record outcomes.

Checklist:
- [x] Report captured
- [x] Context added
- [x] Fix applied
- [x] Tests run
- [ ] Visual/screenshot verification

Verifier notes:
- `python3 scripts/knowledge_check.py` passed.
- `pnpm lint` passed with one pre-existing Tailwind migration warning in `components/metadata-catalog.tsx`.
- `pnpm type-check` passed after fixing the new access helper iteration.
- `pnpm build` passed.
- `pnpm test:progress` still fails due an existing CommonJS/ESM test harness issue around `nanoid` in `lib/utils.ts`; this failure is not introduced by the new auth/rate-limit code.
- Production discovery:
  - Vercel project `app` exists and currently serves `https://www.icm.fyi`.
  - `https://www.icm.fyi/api/chat` currently returns a fallback response because its configured backend URL is `https://rag-service-7loqf3jzwq-ue.a.run.app/chat`, which returns HTTP 404.
  - The authenticated DigitalOcean droplet `attn-markets-data-1` does not currently run an `icm` service/container.

## 2026-03-17 - Restore chat sharing and stand up a serving-only DO backend

Type: feature / infra
Status: in_progress

Context:
- The app still contains share routes, share actions, and the shared-chat page, but the top-level chat page and the indexed home chat entrypoint do not surface sharing consistently after the recent auth and header-control work.
- Production is still wired to a dead Cloud Run backend, so the Vercel frontend needs a new always-on serving target.
- The user only wants the online serving layer on DigitalOcean: assistant API plus Qdrant. Indexing and ingestion remain local and should push vectors into the remote Qdrant instance.

Suspected cause:
- The home page renders `ShareChatHeader` outside the header extras pipeline used by the dedicated chat page.
- There is no current serving-only deployment artifact for `rag + qdrant`, and no fresh DO droplet was previously provisioned for `icm`.

Fix intent:
- Route chat sharing through the same header control path on the home page and verify the signed-in share flow still works.
- Provision a new DigitalOcean droplet that runs only Qdrant and the FastAPI retrieval service, with persistent storage for Qdrant and no indexing workers.
- Document and wire the Vercel app to the new serving endpoint without committing secrets into the repo.

Acceptance criteria:
- Signed-in users can generate a share link from active chats again, and the shared `/share/:id` route renders successfully.
- A new DO droplet exists for the serving tier and runs Qdrant plus the `rag` service continuously.
- The serving droplet does not run ingestion/video indexing workloads.
- The deployment uses repo-safe env handling, with secrets sourced from the shared env file rather than committed files.
- Repo documentation reflects the serving-only split and records the deployed droplet details.

Complexity: large
Plan: [docs/plans/active/2026-03-17-icmfyi-share-and-serving-droplet.md](/Users/user/PycharmProjects/icmfyi/app/docs/plans/active/2026-03-17-icmfyi-share-and-serving-droplet.md)

Executor prompt:
- Update the app under `/Users/user/PycharmProjects/icmfyi/app` to restore the visible share control on active chats and verify the share flow.
- Provision a new DigitalOcean droplet for `qdrant + rag` only, using shared env secrets and avoiding any ingestion/indexing processes.
- Record the serving deployment shape, commands, and verification evidence in repo docs.

Checklist:
- [x] Report captured
- [x] Context added
- [ ] Fix applied
- [ ] Tests run
- [ ] Visual/screenshot verification

Verifier notes:
- DO droplet `icm-serving-1` was created in `nyc3` with public IPv4 `138.197.118.163`, size `s-2vcpu-4gb`, and tag `icm-serving`.
- A DO firewall `icm-serving-fw` now protects the droplet:
  - TCP `22` is currently limited to the operator IP `92.184.104.249/32`.
  - TCP `6333` is currently limited to the operator IP `92.184.104.249/32`.
  - TCP `8000` is open for the public RAG API; `80/443` are reserved for future TLS termination.
- App-side verification passed after the share-control patch:
  - `pnpm lint` passed with the existing Tailwind migration warning in `components/metadata-catalog.tsx`.
  - `pnpm type-check` passed.
  - `pnpm exec playwright test tests/e2e/share-flow.spec.ts` passed.
- Droplet runtime verification:
  - Docker Engine and Compose are installed on `icm-serving-1`.
  - The serving-only compose stack launches `icm-serving-qdrant-1` on `6333` and `icm-serving-rag-1` on `8000`.
  - `rag` served `/healthz` successfully after lowering the droplet runtime to `UVICORN_WORKERS=1`; the previous `UVICORN_WORKERS=2` setting caused a startup race where both workers tried to create the same Qdrant collection and one died with HTTP `409`.
- Remaining blocker:
  - Remote Qdrant seeding is not finished yet. Local collection snapshots were created (`icmfyi-v2__videos` at `2107278848` bytes and `icmfyi-v2__streams` at `217187328` bytes), but moving them from this machine to the droplet is currently bottlenecked by transfer throughput, so the serving tier is online but not fully populated from the existing local corpus yet.
