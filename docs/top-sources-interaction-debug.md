# Top Sources Interaction Debug Log

This note tracks everything we have tried (and still plan to try) to get the three right-panel actions working reliably:

- Clicking the YouTube thumbnail should open the canonical video URL in a new tab at the best clip timestamp.
- `Edit clip` should open the clip drawer.
- `Add to bundle` should toggle the clip selection state.

It also captures how to inspect stacking contexts and which logs are already wired so we can consult Vercel later.

---

## Environment note

- `.env` already points `REACT_APP_BACKEND_URL` / `NEXT_PUBLIC_RAG_API_URL` at the hosted RAG service. Run commands (e.g., `pnpm dev`, `pnpm test:e2e`) with that file loaded so the UI talks to the live backend. If you need to switch to a local backend, update those two variables before starting the app.

---

## 1. Page Overlay / Stacking Checks

- **Tooling:** Running the snippet below in devtools outlines any element that starts a stacking context.  
  ```js
  $$('*').forEach((el) => {
    const cs = getComputedStyle(el)
    const isSC =
      (cs.position !== 'static' && cs.zIndex !== 'auto') ||
      cs.transform !== 'none' ||
      cs.opacity < 1 ||
      cs.mixBlendMode !== 'normal' ||
      cs.filter !== 'none' ||
      cs.isolation === 'isolate' ||
      cs.willChange.includes('transform') ||
      cs.willChange.includes('opacity') ||
      cs.contain !== 'none'
    if (isSC) el.style.outline = '2px dashed rgba(180,0,255,.9)'
  })
  ```
  - **What it tells us:** Every outlined box is a stacking context; if a context with a higher `z-index` overlaps another, it can swallow pointer events. We verified the chat middle panel (`.middlePanel`) was at `z-index: 0` but the fixed chat footer had a `z-index` of 10 and was intercepting clicks.  
  - **Action taken:**  
    - Lowered the middle panel to `z-index: 1` and raised `.rightPanel` to `z-index: 5` with `pointer-events: auto`.  
    - Set the fixed chat panel shell to `pointer-events: none` so the scrollable right panel can receive clicks.  
  - **Result:** Hover styles on thumbnails and buttons now fire, but the click handlers still sporadically no-op—meaning the issue isn’t only z-index.

## 2. Thumbnail / Button Implementation

- **Thumbnail anchor:** The card wraps the preview image in an `<a>` with `target="_blank"` and `rel="noopener noreferrer"`. The href is built from:
  ```ts
  buildCanonicalClipLink(firstClip, parent)
    ?? playback.watchUrl
    ?? firstClip.clipUrl
    ?? firstClip.url
    ?? parent.url
    ?? `https://www.youtube.com/watch?v=${parent.videoId}`
  ```
  - We confirmed the DOM shows the `<a>` element and DevTools reports the expected href, so the data is present.
- **Buttons:**  
  - `Edit clip` triggers `handleClipSelect(parent, clip, 'edit')`.  
  - `Add to bundle` calls `selectionHandle.toggleClip(parent, clip)`.  
  Both rely on the component receiving the click event—so any overlay (pointer blocker) or JS error will break them.
- **Hover affordance gap:** Even after z-index adjustments the cursor sometimes stays as `default`, giving no UX cue that the controls are clickable. We need to confirm whether parent containers (e.g., `.metadataContainer`) or the fixed footer override the cursor style or mask hover events.

## 3. Client-Side Logging

- **Console logging (ready for Vercel log drains):**
  - `source-list: clip select requested` fires before building playback when `Edit clip` is pressed.
  - `source-list: bundle toggle` fires before toggling clip selection (logs previous state and the intended next state).
  - `source-list: thumbnail click` runs just before opening a new tab, capturing the resolved href and clip identifiers.
- **How to pull logs:** After deploy, use `vercel logs <deployment-url> --since 10m --source browser` (or `--source edge-function` if we emit server logs later). Filter by `source-list:` to confirm whether events fire.
- **Future logging ideas:** If the above still yields nothing, we can add instrumentation around the bundle drawer (`clip-bundle-drawer.tsx`) and the clip drawer open sequence to ensure the event bus is responding.

## 4. Things That **Might Still Block Clicks**

| Suspect | Why it matters | Tests / Mitigations |
| ------- | -------------- | ------------------- |
| Residual fixed overlays (e.g., modal backdrops) | Clip drawer or bundle drawer overlays are portal-mounted with higher z-indices; if a drawer never unmounts, it can stay invisible but opaque. | Need to reproduce with drawers closed and inspect DOM for lingering `.pointer-events-auto` overlays. Use DevTools → Elements → search for `.pointer-events-auto` while nothing is open. |
| CSS `pointer-events: none` on child container | If any ancestor in the right panel tree disables pointer events, descendants won’t receive clicks. | DevTools → Computed styles → search “pointer-events”. If `none`, flip it back to `auto` in the stylesheet. |
| Unhandled runtime error | If React throws while rendering a clip handler, the button may stay rendered but handler is undefined. | Check console for red errors; inspect `/app/api/chat/route.ts` responses; review Vercel edge/function logs. |
| Suspense / streaming race | If the right panel re-renders while the user clicks, event handlers may change references. | Verify via React DevTools traces; ensure handlers are wrapped in `useCallback` (currently true). |
| Missing canonical URL data | If `buildCanonicalClipLink` returns undefined, the anchor still renders but opens `about:blank`. | Inspect log output for `href` values; add fallback to show placeholder if the computation fails. |
| Selection handle not wired | If `selection` prop is missing, toggles no-op. | Check `selectionHandle` is defined; logs now include `wasSelected`. If logs never fire, issue is higher in the tree. |
| Cursor style overridden | If a parent applies `cursor: default` or the button/anchor lacks `cursor: pointer`, users get no hover cue and some browsers suppress navigation on `default` cursor elements inside `<div role="button">`. | Inspect computed styles for the anchor and buttons; add explicit `cursor-pointer` class or CSS rule if missing. |
| Bundle drawer intercepts | The clip bundle drawer previously left `pointer-events` enabled while hidden, blocking clicks (detected by Playwright). | Updated `components/clip-bundle-drawer.tsx` to disable pointer events and translate off screen when closed. |
| Missing clip timestamps | Some clips arrive without `startS`/`startHMS` values, disabling HQ actions. | Default start to 30s and end to start + 30s (`computeClipTiming`), while surfacing a UI note so users know timestamps were inferred. |

## 5. Remaining Debug To-Dos

1. **Confirm log emission in production**
   - Deploy the current branch and run `vercel logs <deployment> --since 15m --source browser | grep "source-list"`.
   - If logs appear, capture sample output in this doc for future reference.
2. **Check for hidden overlays after interactions**
   - Trigger clip drawer open + close, bundle drawer open + close.
   - After each action, run the stacking-context outline snippet and inspect whether any full-screen element stays outlined.
3. **Verify canonical links**
   - For a sample entry, trace the computed `topClipHref` by checking the console log.
   - Manually open the link to ensure timestamp parameter is present.
4. **Bundle selection sanity check**
   - Click `Add to bundle`, confirm console shows `nextState: "added"`.
   - Query `document.querySelectorAll('[data-thumbnail]')` to ensure data attributes are set; if selection pills do not appear, escalate to `useClipSelection`.
5. **Hover affordance check**
   - With DevTools, inspect `.metadataContainer button` and the anchor to ensure `cursor: pointer` is applied.
   - If missing, add Tailwind `cursor-pointer` or a CSS override and retest. Re-run the stacking context outline to verify events aren’t blocked.
6. **~~Automated regression suite (Playwright)~~**
   - ~~Run `pnpm test:e2e` locally. The new spec listens for `source-list:` console logs to verify interactions fire.~~
   - ~~Use `PLAYWRIGHT_BASE_URL` to point at staging/production for smoke checks.~~
   - ~~For triage, launch headed mode with `pnpm test:e2e:ui` and execute the `Top Sources interactions` spec manually.~~
7. **Investigate upstream handler plumbing**
   - Trace from `SourceList` props to `app/chat/[id]/page.tsx` to ensure `onSelectClip` and `selection` are passed.
   - If missing, add defensive `console.warn` in `SourceList` when props are undefined.
8. **Restore hover affordance**
   - Inspect the rendered anchor and buttons for `cursor: pointer` in the computed styles. If the computed value remains `default`, add an explicit Tailwind `cursor-pointer` or CSS override on the element itself (not just a parent container).
   - Validate visually that the pointer cursor appears when hovering the thumbnail and both buttons.
9. **Stub or seed data for automated tests**
   - The first `pnpm test:e2e` run (see below) failed because `/api/channels` attempted to hit the local backend and returned ECONNREFUSED, leaving Top Sources empty. Decide whether to:
     - run the backend locally during tests, or
     - provide a mock/fake response (e.g., Next.js route handler override or Playwright network intercept).
   - Once data renders, rerun the spec and capture the passing console logs.
   - 2025‑10‑14: Retested with the hosted backend (see `.env` for the current `NEXT_PUBLIC_RAG_API_URL`). `/api/channels` succeeds, and we now submit a canned prompt inside the Playwright test to populate Top Sources before interacting with the UI.

Add findings here as we continue. The goal is to complete the loop: ensure each action fires in the browser, is logged, and—after the fix—verify the clip drawer opens, bundle toggles, and video opens in a new tab.

---

### Latest automated test run (playwright)

- Command: `pnpm test:e2e`
- Result: **passed** – the spec now types `Summarize the latest Firedancer updates...`, waits for Top Sources, then exercises thumbnail/edit/bundle. All console logs fire and the UI responds (`Added to bundle`, clip drawer opens, escape closes it).
- Artifacts: see `test-results/` for the most recent trace/video should regressions appear.
