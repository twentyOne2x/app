# Clip Interaction UX Refresh

- **Author:** Codex (with input from frontend team)
- **Date:** 2024-10-12
- **Status:** Draft
- **Related Issues:** Clip drawer button confusion, missing thumbnails, chat message rendering bugs

## 1. Background

Clip interactions have accreted over multiple iterations:

- The clip drawer exposes `Open clip`, `Open clip editor`, `Play`, and `Add to bundle` CTAs that map to overlapping behaviors.
- The streaming answer message used to show the clip metadata inline, but recent UI shifts regressed thumbnail rendering for YouTube sources.
- The chat message renderer still strips and fails to render `<span>` tags coming from the assistant/user messages, which makes inline styling and progress indicators look broken.

With the clip bundle experience expanding, we need to simplify the button semantics, ensure thumbnails render reliably, and stop losing HTML that we intentionally emit (e.g., spans around inline emphasis or status badges).

## 2. Goals

1. **Clarify clip CTAs** so users understand the difference between “view”, “edit”, “play”, and “add”.
2. **Guarantee thumbnail coverage** for YouTube clips (and fall back gracefully for other providers).
3. **Restore inline HTML rendering** for assistant/user messages, specifically allowing `<span>` nodes to render without being stripped.
4. Keep the work sequenced so we can ship incremental improvements without breaking in-flight clip interactions.

## 3. Non-Goals

- Rewriting the entire clip selection or bundle subsystem.
- Adding new clip providers beyond YouTube (though architecture should not block future providers).
- Refactoring backend APIs beyond the data needed for thumbnails.
- Replacing the current rich-text rendering library (only targeted fixes to span handling).

## 4. Current Pain Points

### 4.1 Button Redundancy & Ambiguity

- `Open clip` and `Play` both launch playback, but from different surfaces (drawer vs. inline). Users must guess which one they need.
- `Open clip editor` opens an editing drawer that looks similar to the standard clip detail view.
- `Add to bundle` is sometimes hidden or disabled even when the clip is available.
- Buttons move around depending on viewport width, making muscle memory difficult.

### 4.2 Thumbnail Regressions

- The clip drawer expects `clip.thumbnailUrl` but the retrieval pipeline often only supplies `source_url` or `video_id`.
- When the thumbnail is missing, the drawer shows a gray placeholder, and YouTube clips look broken.

### 4.3 Chat Message Rendering (Span Handling)

- `components/chat-message.tsx` still strips `<span>` nodes coming from assistant/user messages.
- This blocks styled badges (e.g., progress indicators, inline metadata labels) and results in text showing raw fallback characters.

## 5. Proposed UX/Tech Changes

### 5.1 Button Taxonomy & Layout

| Action | Proposed Label | Behavior | Surface |
| --- | --- | --- | --- |
| Default CTA | `Play clip` | Immediate playback in drawer (autoplays) | Primary button |
| Secondary | `Edit clip` | Opens the clip editor with trimming controls | Secondary button |
| Secondary | `Add to bundle` | Toggles selection state and updates bundle bar | Tertiary/checkbox-style |

Changes:

1. Promote a single primary CTA (`Play clip`). Remove `Open clip`.
2. Rename `Open clip editor` to `Edit clip` and keep it as the secondary action.
3. Convert `Add to bundle` into a toggle pill/checkbox that provides immediate feedback (“Added” state).
4. Ensure all CTAs stay in a consistent order across breakpoints (primary-left, secondaries grouped).
5. Update hover/focus states and accessibility labels to match the new semantics.

### 5.2 Interaction Flow Updates

- **Play clip:** Opens the drawer and starts playback at the clip start time; ensure cancellation stops playback and resets state.
- **Edit clip:** Opens the editor view (same drawer) but with trimming UI focused; no autoplay.
- **Add to bundle:** Calls `useClipSelection` to toggle the clip; show toast/inline status. If the bundle drawer is closed and the selection count is now >0, auto-open the bar.

### 5.3 Thumbnail Strategy

1. Extend the metadata pipeline so each clip includes:
   - `thumbnail_url` if the backend already has it.
   - Otherwise, for YouTube clips, derive from `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`.
   - For other providers, fall back to placeholder or provider-specific logic.
2. In `components/source-list-inline.tsx` and `components/clip-drawer.tsx`, always prefer `thumbnail_url`.
3. Add defensive loading states and error handling (broken image fallback).

### 5.4 Chat `<span>` Rendering Fix

1. Update `components/chat-message.tsx` markup sanitizer to allow `<span>` (with a whitelist instead of stripping everything).
2. Ensure inline spans maintain styling classes that we emit (e.g., progress markers).
3. Add regression tests verifying spans render for both assistant and user messages.

## 6. Implementation Plan

### Phase 1 – Button & Interaction Cleanup

- Normalize CTA definitions in `components/clip-drawer.tsx`.
- Update `ClipBundleBar` and `useClipSelection` to expose selection state to CTA buttons.
- Remove legacy `Open clip` CTA and rename `Open clip editor` to `Edit clip`.
- Add analytics events for the new button taxonomy.

### Phase 2 – Thumbnail Restoration

- Extend `ParsedMetadataEntryV2` (`lib/utils.ts`) to include `thumbnailUrl`.
- Update backend mapping (ensure `/chat/stream` diagnostics or metadata includes thumbnails).
- Update drawer/list components to render thumbnails with fallback logic.
- Add placeholder skeleton while resolving the URL.

### Phase 3 – Span Rendering Fix

- Adjust `chat-message` sanitizer to allow safe inline spans.
- Cover with tests in `tests/query-progress.test.js` or a new rendering suite.
- Audit existing messages to ensure they no longer rely on the special `▍` substitution.

## 7. Testing Strategy

- **Unit Tests:** Extend selection hooks and chat rendering tests to cover new semantics.
- **Integration Tests:** Add Playwright smoke test that:
  - Clicks `Play clip`, ensures video starts.
  - Clicks `Edit clip`, ensures editing UI opens.
  - Toggles `Add to bundle` and validates the bundle bar updates.
- **Manual QA Checklist:**
  - Clips with/without thumbnails.
  - Shared chats (read-only) – ensure CTAs disable appropriately.
  - Progress message rendering with spans.

## 8. Risks & Mitigations

- **Backend metadata gaps:** fallback YouTube thumbnail logic ensures coverage even if API omits `thumbnail_url`.
- **CTA behavior drift:** Provide analytics instrumentation to confirm usage patterns post launch.
- **HTML sanitization regression:** Keep sanitizer scoped to allow only `<span>` (and existing safe tags), avoiding broader XSS surface.

## 9. Open Questions

1. Do we need an inline “preview in YouTube” CTA, or is in-app playback sufficient?
2. Should `Edit clip` auto-save edits, or require explicit confirmation?
3. Are there non-YouTube providers where we can safely derive thumbnails without extra API calls?
4. Do we need to support additional inline HTML elements beyond `<span>` (e.g., `<mark>`, `<small>`)? If yes, update whitelist simultaneously.
