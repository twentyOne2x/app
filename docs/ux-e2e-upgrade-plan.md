# End-to-End UX Upgrade Plan

## Why this exists
- Bring every major journey (chat, clip editing, sharing) up to current UX expectations.
- Use Playwright as the backbone for smoke and regression validation.
- Track the outstanding UX bugs we know about (timestamps, bundle downloads, question prompts, etc.) and the ones we are likely to discover as we expand coverage.

## Existing coverage snapshot
- ✅ `tests/e2e/top-sources.spec.ts` exercises: prompt → Top Sources → thumbnail / edit / bundle toggle.
- ⚠️ Gaps:
  - No test currently resets a conversation mid-run.
  - No check around the clip bundle "copy timestamps" affordance or ZIP downloads.
  - No scenario covering empty/zero metadata responses (Playwright skips instead).
  - No coverage for signing in/out or account-specific features (bundle persistence, sharing).

## Journeys to support (Playwright first)

### Chat creation & iteration
- [ ] User lands on chat home → sends first question → waits for response.
- [ ] User submits follow-up question while previous answer streams.
- [ ] User uses "Reload questions" suggestions and verifies prompt is sent.
- [ ] User clears conversation (new chat broom) and confirms history resets.
- [ ] User toggles channel filter, re-asks question, ensures response metadata respects new filter.

### Clip exploration & editing
- [ ] Open clip drawer → verify sanitized timestamps → queue HQ clip → observe toast/logs.
- [ ] Clip missing timestamps → verify fallback note displays and HQ call still succeeds.
- [ ] Copy timestamps button (bundle drawer) → clipboard contents include timestamped URLs → bundler finishes.
- [ ] Bundle ZIP ready → download link accessible (stub download in tests to avoid disk writes).
- [ ] Error path: mock `/api/clips/batch` 501 → UI displays "not implemented" notice.

### Sharing & persistence
- [ ] Create shared chat via UI → open share URL → confirm Top Sources + answers render.
- [ ] Load existing chat from KV (requires seeded data) → confirm question list, answer, metadata state.
- [ ] Sign-in flow (Privy/Twitter) – optional depending on environment; at least stub for smoke.

## Observability tasks (server/client logs)
- [x] Log missing timestamps in `computeClipTiming` (client console/devtools).
- [x] Log missing structured metadata timestamps in `/api/chat` response handling (Vercel server logs).
- [ ] Add logging around `/api/clips` & `/api/clips/batch` (duration, payload sizes, failures).
- [ ] Emit structured logs for clipboard copy success/failure.
- [ ] Track Playwright failures via CI artifacts (trace/video).

## Bug backlog (tracked as checkboxes)
- [x] Default clip timing when metadata lacks start/end (client bundle & HQ flows).
- [ ] Investigate why backend metadata sometimes supplies timestamps that the UI drops (compare Vercel logs to final JSON streamed to client).
- [ ] Ensure bundle drawer surfaces which clip caused an error (currently generic toast).
- [ ] Prevent duplicate clips from being added to bundle when toggled quickly.
- [ ] Support manual timestamp entry in clip drawer (advanced user feature).

## Next steps
1. Implement Playwright journeys above incrementally (add `tests/e2e/chat-journeys.spec.ts`, `tests/e2e/bundle-flow.spec.ts`).
2. Expand server logging to `/api/clips` endpoints for timestamp debugging.
3. Re-run smoke suite against staging + production deployments.
4. Share this plan with design/PM for prioritization and sign-off.

---
_Last updated: 2025-10-14_
