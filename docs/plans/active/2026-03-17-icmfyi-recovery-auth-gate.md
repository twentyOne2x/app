# Outcome

Code changes complete and locally verified. Live production cutover is not completed from this session because:
- the current Vercel production deployment is still pointed at a dead Cloud Run RAG endpoint returning 404
- the reachable DO droplet does not currently host an `icm` backend service
- the local worktree contains unrelated pre-existing changes, so a blind production deploy from this tree would ship additional unreviewed work

# Objective

Restore a production-ready `icm.fyi` deployment shape with:
- Vercel-hosted Next.js frontend
- DigitalOcean-droplet-hosted backend services
- durable anti-spam controls
- mandatory Twitter or Google OAuth after 3 anonymous prompts
- updated public social link routing

# Non-goals

- Re-architecting the RAG backend itself
- Replacing the existing chat UI layout wholesale
- Introducing a new database beyond the currently used KV / local fallback model

# Constraints / Non-negotiables

- Do not revert unrelated user edits already present in the worktree.
- Keep anonymous preview gating enforced on the server so refreshes cannot bypass it.
- Prefer Vercel-compatible Node route logic over Edge middleware for mutable rate-limit state.
- Preserve local development fallbacks when KV is absent, while documenting that production should use KV.
- Keep the auth flow on NextAuth and shift the supported providers to Twitter and Google.

# Step-by-step plan

1. Add a shared server-side access-control module for:
   - durable anonymous identifier cookie management
   - preview message counting
   - chat rate limiting
   - response helpers for auth-required / rate-limited cases
2. Integrate access control into `/app/api/chat/route.ts` and `/app/api/chat/stream/route.ts`.
3. Replace Privy-centric auth config/UI with Twitter + Google OAuth support.
4. Surface the gate in the client:
   - disable or block prompt submission when anonymous quota is exhausted
   - show Twitter/Google call-to-actions
   - preserve callback URLs so users can continue after sign-in
5. Update public social link references from `icmdotfyi` to `twentyOne2x`.
6. Add production deployment documentation for:
   - Vercel app env vars
   - DO droplet backend runtime
   - required secrets / services
   - smoke checks
7. Verify with lint, type-check, focused tests, and deployment-tool availability checks.

# Verification plan

Commands:
- `python scripts/knowledge_check.py`
- `pnpm lint`
- `pnpm type-check`
- `pnpm test:progress`
- targeted Playwright/auth tests if feasible
- `vercel whoami` and `doctl account get` only if the CLIs are available, to determine whether live deployment is possible from this environment

Expected artifacts:
- passing static checks and focused tests
- updated auth/UI behavior in code
- deployment documentation describing the Vercel + DO split
- explicit note on whether live deployment was completed or blocked by missing credentials/access

# Rollback / Recovery

- Revert only the newly introduced access-control/auth/deployment changes if they regress chat submission.
- If server-side gating causes unexpected lockouts, disable enforcement in the chat routes first while preserving the provider/UI updates.

# Decision log

- 2026-03-17: Treat as `large` because it spans auth, server enforcement, UI behavior, and deployment/runtime documentation.
- 2026-03-17: Prefer route-level rate limiting instead of middleware because the existing middleware intentionally avoids KV usage in the Edge runtime.
- 2026-03-17: Use Twitter + Google on NextAuth rather than continuing the Privy wallet flow, per request.

# Progress log

- 2026-03-17: Inspected current app auth, chat routes, header links, sidebar/chat persistence, and local compose/backend layout.
- 2026-03-17: Confirmed the working tree is already dirty in several app files; implementation must avoid clobbering unrelated edits.
- 2026-03-17: Implemented server-side preview gating, route rate limiting, Twitter/Google auth UI, X link migration to `twentyOne2x`, and Vercel + DO deployment documentation.
- 2026-03-17: Verification passed for `knowledge_check` (`python3`), lint, type-check, and production build. `test:progress` still fails because of a pre-existing `ERR_REQUIRE_ESM` issue in the existing Node test harness when `lib/utils.ts` requires `nanoid`.
- 2026-03-17: Production investigation found Vercel project `app` serving `www.icm.fyi`, but `/api/chat` is wired to a dead Cloud Run URL returning 404; DO droplet `attn-markets-data-1` is reachable but has no `icm` service deployed.
