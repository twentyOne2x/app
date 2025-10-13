# Frontend UI Manual Review Guide

Use this checklist whenever you need human proof that the latest UI changes behave as expected. It walks through populating the app with real data, verifying click targets, capturing screenshots, and confirming server/client logging. The steps mirror the standards we discussed (thumbnails always visible, action buttons clickable, responsive composer, collapsible filters, etc.).

---

## 1. Prerequisites

1. **Dependencies installed**  
   ```bash
   pnpm install
   ```

2. **Environment variables**  
   Copy `.env.example` to `.env` and fill in the fields you normally use for development (OpenAI / Pinecone / RAG backend URLs). For purely visual testing, the defaults can reference staging services.

3. **Clean build + tests** *(run once before starting UI review)*  
   ```bash
   pnpm test:progress
   pnpm run build
   ```

4. **Start the dev server**  
   ```bash
   pnpm dev
   ```
   The app will be available at http://localhost:3000.

---

## 2. Mocking data (if needed)

If the backend is unavailable, use the `/api/chat` route to seed a mock response. The following `curl` command injects a sample conversation with clip metadata that exercises thumbnails, excerpts, and the action buttons:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [
      {"role": "user", "content": "Return all videos about Kyle Samani"}
    ],
    "channel_filter": null,
    "entryProfileCode": "prf-default-e9b6fbea",
    "id": "manual-review"
  }'
```

Open http://localhost:3000/chat/manual-review after running the command.

---

## 3. Screenshot checklist

Capture the following screens and store them under `docs/screenshots/<date>/`:

1. **Chat landing**  
   - Full-width view (≥1280px).  
   - Verify Top Sources cards have 240×180 thumbnails (no collapsed images).  
   - Ensure clip action bar shows only “Edit clip” and “Add to bundle”.

2. **Chat landing (collapsed filter)**  
   - Collapse the “Channel filter” panel.  
   - Capture screenshot showing the collapsed state and the responsive chat composer.

3. **Mobile-sized view**  
   - Resize the browser to ≤640px width.  
   - Confirm the composer narrows (clamp width, smaller padding).  
   - Take screenshots of:  
     - The composer  
     - A clip card (ensuring the fallback thumbnail is still 240×180 and uses `/default-thumbnail.svg` if the URL fails).

4. **Metadata list (Right rail)**  
   - Capture the `Top Sources` panel to verify:  
     - Thumbnails show at least the fallback SVG.  
     - Excerpts no longer include `[Speaker | start – end]`.

Use any screenshot tool you prefer (Chrome dev tools → “Capture screenshot”, macOS `⇧⌘4`, etc.). Name screenshots descriptively, e.g. `chat-desktop.png`, `chat-mobile-filter-collapsed.png`, etc.

---

## 4. Click-through verification

With DevTools open (Console tab):

1. **Clip actions**  
   - Click `Edit clip` → confirm the clip drawer opens and the console logs `chat: clip selected` with intent `edit`.  
   - Click `Add to bundle` → ensure the bundle bar opens and the console logs selection changes.

2. **Channel filter**  
   - Toggle a channel checkbox; confirm the request payload logs `channelFilter` updates in the console.  
   - Collapse/expand the entire panel and verify the button toggles the `aria-expanded` attribute.

3. **Composer**  
   - Type a long message and note the textarea height—should not overflow; the clamp width keeps it centered.  
   - Submit a query and watch the progress logging appear.

4. **Thumbnail inspection**  
   - For each Top Sources card, inspect the `<Image>` element in DevTools. Confirm the `src` attribute points to either `https://i.ytimg.com/vi/<id>/hqdefault.jpg` or `/default-thumbnail.svg` if no ID exists.

---

## 5. Logging verification

1. **Console (client side)**  
   - With the query running, confirm these logs appear:  
     - `utils: parseYouTubeIdFromString matched ...` (verifies ID extraction).  
     - `utils: youtubeThumbFor ... derivedId` (shows final ID used).  
     - `utils: resolveThumbnailUrl ...` (exposes direct/fallback usage).

2. **Server (Next.js console)**  
   - In the terminal running `pnpm dev`, check for:  
     - `chat-route: backend json payload`  
     - `chat-route: backend diagnostics snapshot` (should list `final_kept` segment IDs)  
     - `chat-route: final_kept node ...` for each clip.

3. **Vercel logs (optional)**  
   - If you need the same visibility on a remote deployment, use the helper script:  
     ```bash
     ./scripts/vercel-logs.sh <deployment-url-or-id> --since 30m
     ```
   - Verify the same debug statements appear server-side.

Document any anomalies (missing logs, zero-length thumbnails, non-clickable buttons) before proceeding.

---

## 6. Completion criteria

- ✅ Screenshots saved under `docs/screenshots/<date>/`.  
- ✅ All UI elements respond as expected (buttons clickable, filter collapses, composer rescales).  
- ✅ Console + server logs confirm thumbnail IDs are resolved or fallback assets are used.  
- ✅ No residual `[Speaker | ...]` prefixes or negative/unknown timestamps in UI.  
- ✅ Tests/build were executed prior to review.

If any item fails, log the findings in the PR (or issue tracker) and repeat after the fix.

---

## 7. Appendix – Quick commands

| Action | Command |
| --- | --- |
| Start dev server | `pnpm dev` |
| Run tests | `pnpm test:progress` |
| Production build | `pnpm run build` |
| Mock chat request | `curl -X POST …` *(see section 2)* |
| Vercel logs | `./scripts/vercel-logs.sh <deployment> --since 30m` |

Keep this document alongside screenshots as evidence that the front-end meets the UI standards requested.
