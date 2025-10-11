# Clip Batch Experience – UX & Interaction Spec

This document details the product and engineering requirements for Phase C of the clip workflow: letting users select multiple clips, monitor batch generation, and download bundles. It builds on the Phase A/B foundations already implemented in the app.

---

## 1. Product Objectives

1. **Quickly flag clips** while browsing the source list, without losing context.
2. **Review and manage the selection** in one place (add/remove, reorder, clear).
3. **Trigger high-quality batch generation** with minimal latency.
4. **Track progress** per clip and for the bundle as a whole.
5. **Download results** (per clip or ZIP bundle) once ready.
6. **Handle errors gracefully** with understandable recovery paths.

---

## 2. UX Overview

### 2.1 Source List Enhancements

| Element | Behavior |
| --- | --- |
| Checkbox | Visible on hover or focus. Ticking it adds/removes the clip from the selection, updates counter. |
| Context buttons | On hover, show a row with “Generate HQ” (single clip) & “Add to bundle” (checkbox). Disabled when the backend reports unsupported metadata. |
| Badges | Selected clips gain a subtle highlight + “Selected” pill. |

**Keyboard:** `Tab` should reach the checkbox; `Space` toggles selection. Screen readers announce “Selected clip <title> start <time> end <time>”.

### 2.2 Persistent Selection Bar (“Bundle Bar”)

| Section | Details |
| --- | --- |
| Summary | `n clips selected`. Shows up after first selection, positioned bottom-right on desktop, full width above keyboard on mobile. |
| Clip tokens | First three selections shown as pill chips (title + start time). Hover/focus reveals an inline “x” to remove. |
| Actions | `Generate bundle` primary CTA (disabled until backend ready), `Clear selection` secondary link. Future: `Save bundle`. |
| Toasts | Success toast when clip added (“Added clip to bundle”), info toast when bundle started (“Generating HQ bundle… estimated time X”). |

### 2.3 Bundle Drawer (Batch Detail)

Triggered by clicking `Generate bundle`. Slides in from right on desktop, full-screen modal on mobile.

| Section | Content |
| --- | --- |
| Header | Title “Bundle in progress”, optional close button (esc closes but keeps bundle running). |
| Timeline rows | Table with columns: Clip, Status badge, Progress, Actions. Status states: `Queued`, `Processing`, `Ready`, `Error`. |
| Bundle actions | Once all ready, buttons `Download ZIP` (primary), `Copy share link` (secondary). Until ready, show disabled states + tooltips. |
| Diagnostics | If backend returns `diagnostics` with request ID, surface a collapsible “Details” section. |

### 2.4 Empty States & Errors

| Scenario | UX |
| --- | --- |
| No clips selected | Selection bar hidden; bundle drawer shows “Select clips to create a bundle.” link to top sources. |
| Backend unreachable | Toast error + inline banner in drawer: “The clip service is unavailable. Your selection remains saved.” |
| Individual failure | Status row switches to `Error`. Action column shows “Retry” button + tooltip with error message. Retrying requeues that clip only. |
| ZIP build failure | Inline banner, `Download ZIP` disabled but individual clips still downloadable. CTA to “Report issue” (placeholder). |

### 2.5 Mobile Considerations

| Aspect | Treatment |
| --- | --- |
| Selection bar | Sticky above bottom nav; CTA expands to full width. |
| Bundle drawer | Fullscreen modal with swipe-to-close. |
| Toasts | Avoid stacking; use concise text to prevent overlap with keyboard. |

---

## 3. Interaction & State Flow

### 3.1 Selection State Diagram

```
Idle
  └─[select clip]→ SelectionActive
    ├─[select more] → (remain)
    ├─[deselect last clip] → Idle
    └─[clear] → Idle
```

### 3.2 Bundle Lifecycle

```
SelectionActive
 └─[Generate bundle]→ BundleProgress
                     ├─ each clip:
                        Queued → Processing → Ready (or Error → Retry)
                     ├─ when any clip Ready → enable per-clip download
                     └─ when all Ready → enable bundle download
```

### 3.3 API Polling Logic

1. POST `/clips/batch` returns `batch_id`, per-clip `clip_id`s.
2. Poll `GET /clips/batch/:id` (1.5s interval) until `status` `ready|error`.
3. Update UI row states; stop polling when all in terminal state.
4. Optional: `GET /clips/:id/logs` for e2e debugging (future).

---

## 4. API Contracts (Phase C MVP)

### 4.1 POST `/clips/batch`
```json
{
  "clips": [
    {
      "sourceUrl": "https://www.youtube.com/watch?v=XYZ&t=123",
      "start": 120.5,
      "end": 185.2,
      "contextMode": "seconds",
      "padBefore": 5,
      "padAfter": 5
    }
  ],
  "dedupe": true
}
```
**Response**
```json
{
  "batchId": "batch_abc123",
  "clips": [
    {
      "clipId": "clip_def456",
      "index": 0,
      "status": "queued"
    }
  ]
}
```

### 4.2 GET `/clips/batch/:id`
```json
{
  "batchId": "batch_abc123",
  "status": "processing",
  "clips": [
    {
      "clipId": "clip_def456",
      "status": "processing",
      "progress": 0.65,
      "streamUrl": null,
      "downloadUrl": null,
      "error": null
    }
  ],
  "bundle": {
    "status": "queued",
    "downloadUrl": null
  },
  "diagnostics": {
    "request_id": "clip_req_123",
    "queued_at": 1728670000
  }
}
```

### 4.3 Error schema
```json
{
  "error": "rate_limited",
  "message": "Too many concurrent bundles; try again in 30s.",
  "retry_after": 30
}
```

---

## 5. Instrumentation

Event | Payload
--- | ---
`clip_selection.add` | clip_id, parent_id, scope, selection_count
`clip_selection.clear` | selection_count_before
`clip_bundle.start` | batch_id, count, scope
`clip_bundle.clip_ready` | batch_id, clip_id, duration_ms
`clip_bundle.clip_error` | batch_id, clip_id, error_code
`clip_bundle.ready` | batch_id, total_duration_ms
`clip_bundle.download` | batch_id, via (`zip` \| `individual`)

These should be sent to the existing analytics pipeline (BigQuery / KV) to monitor usage and surface ingestion issues.

---

## 6. Non-Goals (Phase C MVP)

- ZIP generation on the client (handled by backend).
- Progressive HTML5 playback for bundles (single clip only).
- Persisting bundles to share with other users (future nice-to-have).
- Mobile offline support.

---

## 7. Open Questions & Next Steps

1. **ZIP retention policy** – delete after 24h or keep indefinitely? (affects storage usage)
2. **Rate limits** – define per-user and global limits to prevent abuse.
3. **Selectable metadata** – should user be able to rename bundle or add notes before download?
4. **Snapshot sharing** – once batch downloads, do we expose a `/share/batch/:id` view?

**Next actions**
1. Confirm backend endpoints & dedupe behavior (Phase B service team).
2. Create tasks for UI implementation following the spec:
   - Source list buttons & accessibility
   - Selection bar + drawer UI
   - Client-side polling and state management
   - Toasts/analytics
3. Add Playwright tests covering multi-select, batch progress, error handling.

Once the backend endpoints are ready, this spec can be implemented in incremental frontend PRs.***
