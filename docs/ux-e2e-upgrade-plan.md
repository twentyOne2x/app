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

- [ ] **Performance budgets – baseline**  
  *Targets:*  
  • First paint/TTI ≤ 3 s (desktop fast 3G cold load)  
  • First assistant placeholder ≤ 1 s after `Enter`  
  • Additional front-end delay after backend stream ≤ 400 ms  
  • Clip drawer open ≤ 500 ms  
  • Bundle drawer open ≤ 500 ms  
  • Cached navigation < 1 s  
  *Test:* Lighthouse CI run on `/`, capture LCP/CLS/TBT (≤ 2.5 s, ≤ 0.1, ≤ 200 ms).  
  *Success:* Metrics recorded in CI, regressions flagged automatically.

## Journeys to support (Playwright first)

### Chat creation & iteration
- [ ] **Initial page responsiveness**  
  *Test:* Capture `performance.timing` (or `page.metrics()`) on landing page; ensure time-to-interactive (TTI) < 3s on cold load in CI environment.  
  *Success:* Metrics logged to Playwright trace, failing threshold raises test error.
- [ ] **First question happy path**  
  *Test:* Playwright fills prompt, hits `Enter`, waits for assistant message + Top Sources.  
  *Success:* Response text renders, `source-list` shows ≥1 entry, console `source-list:` logs fire.  
- [ ] **While-stream follow-up**  
  *Test:* Trigger second prompt before metadata finishes, ensure UI queues request.  
  *Success:* Loader renders, no duplicate answer bubbles, backend logs show second request with distinct trace ID.  
- [ ] **Reload questions CTA**  
  *Test:* Click `↻`, pick new suggestion, verify input populated and submitted.  
  *Success:* Chat history shows suggestion as user message, assistant answers.  
- [ ] **Reset conversation**  
  *Test:* Click broom button, confirm empty state, send new prompt.  
  *Success:* Previous messages removed, KV shows new chat entry with fresh ID.  
- [ ] **Channel filter respect**  
  *Test:* Exclude channel(s), resend prompt, inspect metadata.  
  *Success:* `structured_metadata` excludes filtered channels, UI badges reflect new selection.

### Clip exploration & editing
- [x] **Open clip drawer + queue HQ**  
  *Test:* Click `Edit clip`, inspect timing display, press `Generate high-quality clip`.  
  *Success:* Toast success message, console log from `computeClipTiming` absent (meaning no fallback).  
- [x] **Missing timestamps fallback**  
  *Test:* Inject clip with only end time, open drawer.  
  *Success:* Banner `(timestamps missing, using defaults)` appears, button enabled, HQ request accepted.  
- [x] **Copy timestamps to clipboard**  
  *Test:* Bundle two clips, click `Copy clip timestamps`.  
  *Success:* `navigator.clipboard.readText()` contains newline list with `→` label + timestamped URLs.  
- [x] **Bundle ZIP flow**  
  *Test:* Mock `/api/clips/batch` to resolve `ready`, ensure `Download ZIP` link works (stub network).  
  *Success:* Button transitions to enabled state, link contains HTTPS URL.  
- [ ] **Batch error path**  
  *Test:* Return 501 from batch endpoint.  
  *Success:* UI surfaces “not yet available” message, log entry recorded.

#### Priority focus — clip reliability
- Local stub service now exercises HQ request + bundle + clipboard flows (see `tests/e2e/clip-flows.spec.ts`). When the production batch API ships, mirror its contract so these tests continue to pass.
- Instrument additional logging during these tests so we can capture residual timestamp fallbacks or batch failures in Vercel.

### Sharing & persistence
- [ ] **Create share link**  
  *Test:* Click share action, copy link, open in new browser context.  
  *Success:* Shared page renders assistant answer + Top Sources read-only state.  
- [ ] **Load historical chat**  
  *Test:* From signed-in state, open past chat via sidebar, ensure KV data hydrates.  
  *Success:* Transcription, metadata, bundle selections restored; network logs show `/api/chat/[id]`.  
- [ ] **Auth smoke test**  
  *Test:* Perform sign-in via stub / real provider in test env, ensure UI updates.  
  *Success:* Avatar dropdown appears, chat history tied to user ID.

### Session, navigation & account surface
- [x] **Sidebar conversation list**  
  *Test:* Signed-in load should show ≥1 conversation with preview.  
  *Success:* Items link to `/chat/[id]`, active item highlighted.  
- [x] **Header dropdown actions**  
  *Test:* Click avatar, exercise copy/settings/sign-out.  
  *Success:* Clipboard receives profile URL, settings placeholder modal toggles, sign-out returns to anonymous state.  
- [x] **Empty state onboarding**  
  *Test:* User with zero chats sees onboarding card, clicking “Fetch sample conversations” populates list.  
  *Success:* Toast confirmation + new list items.  
- [x] **Playwright session flow**  
  *Test:* Automate sign-in → open second conversation → sign-out.  
  *Success:* Each step validated via UI assertions and console logs.

### Accessibility guardrails
- [ ] **Keyboard navigation**  
  *Test:* Playwright (or Axe) tabs through header → sidebar → chat composer → clip drawer.  
  *Success:* Focus outlines visible, tab order logical, no element traps keyboard focus.  
- [ ] **ARIA & labeling audit**  
  *Test:* Run `axe-core` scan when clip drawer and bundle drawer are open.  
  *Success:* Zero critical issues; actionable warnings tracked.  
- [ ] **Color contrast**  
  *Test:* Snapshot critical text/background combos (drawer header, buttons) for contrast tooling.  
  *Success:* Meets AA (4.5:1) for text <24px, 3:1 for larger text.

### Responsive & mobile coverage
- [ ] **Narrow viewport layout**  
  *Test:* Playwright emulates iPhone 12, ensures left sidebar collapses into top-level drawer, prompt composer usable.  
  *Success:* No horizontal scroll, questions list accessible via toggle.  
- [ ] **Clip drawer on mobile**  
  *Test:* Open clip drawer on 375px width, scroll through padding controls.  
  *Success:* Controls remain tappable, no fixed positioning bugs.  
- [ ] **Bundle drawer on mobile**  
  *Test:* Add clips, open bundle drawer on mobile view.  
  *Success:* Drawer anchors from bottom as sheet, copy/download buttons visible without overflow.

### Failure, offline, and latency scenarios
- [ ] **Backend 503 / slow response**  
  *Test:* Mock `/api/chat` to delay >30s, observe UI fallback (spinner + retry).  
  *Success:* User sees informative message, no console errors.  
- [ ] **Metadata missing**  
  *Test:* Inject final_kept with missing timestamps (already happening).  
  *Success:* Fallback messaging logs (Vercel) + clip drawer still operational.  
- [ ] **KV unavailable**  
  *Test:* Simulate KV errors, ensure app degrades gracefully (no hard crash).  
  *Success:* Warning toast + console message, user can continue transient session.

### Telemetry & analytics sanity
- [ ] **Console/Vercel logs**  
  *Test:* After each journey, confirm structured logs (traceId) exist in Vercel log stream.  
  *Success:* Can correlate client action with server log, no missing trace info.  
- [ ] **Event instrumentation (future)**  
  *Test:* Hook analytics (if available) to confirm critical events fire (prompt sent, clip queued).  
  *Success:* Data captured once per action, no duplicates.
- [ ] **Visual regression coverage**  
  *Test:* Add Storybook snapshots using Chromatic (primary), with Percy and Applitools considered for cross-browser parity.  
  *Success:* Baselines exist for key components (chat layout, clip drawer, bundle drawer). PR diffs highlighted automatically.
- [ ] **Component acceptance tests**  
  *Test:* Storybook stories exercise edge states (missing timestamps, long titles) and feed Chromatic/Percy/Applitools pipelines.  
  *Success:* Visual diffs caught before merge; documentation stays in sync.
- [ ] **Synthetic performance audits**  
  *Test:* Run Lighthouse CI (optionally via WebPageTest/PageSpeed) on `/` and `/chat/[id]`.  
  *Success:* Budgets above enforced; CI fails if thresholds exceeded.  
- [ ] **Real user monitoring**  
  *Test:* Verify Vercel Analytics (or Datadog/Sentry) captures TTFB, LCP, error rates with `traceId`.  
  *Success:* Production dashboards show expected metrics per release.  
- [ ] **API / contract smoke**  
  *Test:* Schedule k6/Postman smoke calling RAG `/chat` & `/clips/batch` at low load.  
  *Success:* Alerts if latency/SLA drift outside desired window.

### Performance budgets & monitoring
- [ ] **Bundle drawer latency**  
  *Test:* Measure time between click and drawer render; target <500 ms.  
  *Success:* Logged metric stays within budget; Playwright assertion passes.  
- [ ] **Clip drawer render time**  
  *Test:* Use `performance.mark` around clip drawer open.  
  *Success:* Under 400 ms on median hardware.  
- [ ] **Repeat load caching**  
  *Test:* Reload chat page after first answer; ensure static assets served from cache (<1 s).  
  *Success:* Network tab shows 304/ memory cache for JS chunks.

### Security & session integrity
- [ ] **Session persistence**  
  *Test:* Sign in, refresh page, confirm session still active.  
  *Success:* Avatar + conversation history present; network uses valid cookies.  
- [ ] **Sign-out clears data**  
  *Test:* Sign out, check localStorage/sessionStorage for residual tokens.  
  *Success:* Clip selections and KV identifiers cleared; redirected to anonymous state.  
- [ ] **Cross-tab consistency**  
  *Test:* Open app in two tabs, modify bundle in one.  
  *Success:* Second tab receives storage events (or on refresh) reflecting changes.

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
