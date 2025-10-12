# Clip Interaction Follow-up Tasks

- **Date:** 2024-10-12  
- **Author:** Codex (frontend implementation notes)

The first pass of the clip interaction refresh exposed several regressions and usability issues that must be addressed before shipping. This document tracks every outstanding task, with notes on expected behaviour and suggested implementation details.

---

## 1. Clip Card Content & Styling

### 1.1 Remove Speaker Initials From Clip Rows
- **Problem:** The excerpt header currently includes the `speaker_primary` field (e.g. `"[B | 00:12:10.690 – 00:12:31.930]"`). Speakers are often labelled “A/B” which adds noise without value.
- **Task:** Strip speaker labels entirely when rendering clip timestamps (both in the inline source list and the drawer metadata).
- **Expected outcome:** Clip header becomes `"[00:12:10.690 – 00:12:31.930]"`. No “A” or “B” prefixes.
- **Implementation hints:**  
  - Update `clipWindow` (and any other helpers) to omit speaker fields.  
  - Ensure the drawer, inline cards, and metadata list stay consistent.

### 1.2 Timestamp Placement & Styling
- **Problem:** Start/end timestamps appear inline with the excerpt body, which harms scannability.
- **Task:** Render the timestamp range on the same metadata row as the score badge, immediately after the score.
- **Expected outcome:** Clip header line should read something like: `clip · 82/100 · 00:12:10 – 00:12:31` with the excerpt rendered below.
- **Implementation hints:**  
  - Adjust the metadata stack in `components/source-list.tsx` and the inline list to position timestamps beside the badge.  
  - Confirm spacing works on mobile breakpoints.

### 1.3 Smaller Excerpt Text
- **Problem:** Excerpt font-size competes with the metadata.  
- **Task:** Reduce excerpt font-size (e.g. from `text-sm` → `text-xs`) and adjust line-height for dense layouts.
- **Expected outcome:** Excerpts are visually subordinate to the clip metadata and do not dominate the card.

---

## 2. CTA Interactions

### 2.1 Button Click Targets
- **Problem:** `Open clip editor`, `Play`, and `Add to bundle` buttons do not respond in the list view (likely due to the parent `<label>` checkbox overlay swallowing pointer events).
- **Task:** Audit the DOM structure to ensure the buttons are not inside a `<label>` or other element with conflicting cursor behaviour.
- **Expected outcome:** Each button fires its intended handler on the first click without toggling the checkbox.
- **Implementation hints:**  
  - Remove the checkbox `<label>` wrapper; rely on explicit checkbox clicks.  
  - Validate with keyboard navigation and focus outlines.

### 2.2 Selection Toggle Duplicates
- **Problem:** Selecting one clip sometimes toggles two entries when their time windows overlap.
- **Task:** Combine overlapping clips (same parent, overlapping start/end) into a single merged entry with min/max timestamps.
- **Expected outcome:** Only one checkbox per merged range; toggling it affects a single selection record.
- **Implementation hints:**  
  - Merge clip arrays during normalization (`normalizeMetadataEntries` or a dedicated helper).  
  - Keep original excerpts (maybe concatenate) or pick the highest-scoring excerpt.  
  - Update selection keys (`parentId` + merged range) to avoid duplicates.

---

## 3. Thumbnail Rendering

### 3.1 Respect Backend `url` Fields
- **Problem:** Despite backend providing the canonical `url`, thumbnails still fall back to the placeholder.
- **Task:** Ensure thumbnail derivation prefers the `url` (or `clip_url`) from metadata before falling back to derived YouTube IDs.
- **Expected outcome:** Cards show the real preview for the provided example (`https://www.youtube.com/watch?v=CEuKahqOYbs`) without logging “missing thumbnail”.
- **Implementation hints:**  
  - Confirm `clip.thumbnailUrl` or `parent.thumbnailUrl` is set after normalization.  
  - Verify that `toAbsoluteUrl` handles trailing whitespace and that the `links` survive through parse/normalize.  
  - Re-run selection UI to ensure no residual `console.debug('missing thumbnail')` logs.

---

## 4. Inline HTML Rendering

### 4.1 `<span>` Still Stripped
- **Problem:** Chat messages still remove `<span class="quote-chip">…</span>` despite the sanitize schema.
- **Task:** Re-check markdown pipeline to ensure the custom sanitize schema is actually used in production builds.
- **Expected outcome:** The example excerpt renders with the styled span intact.
- **Implementation hints:**  
  - Confirm `MemoizedReactMarkdown` receives the `rehypePlugins` prop (no memoization skip).  
  - Verify the schema allows `class` (React uses `className`). Adjust sanitizer to copy `className` → `class` if necessary.  
  - Add a live unit test that renders via the same component tree we use in the app (not a simplified reproduction).

---

## 5. Deliverables & Verification

1. Apply code fixes in source list components, normalization helpers, and chat renderer.  
2. Add test coverage for:
   - Span rendering through the real component tree.  
   - Clip merging logic (unit test covering overlapping windows).  
3. Manual QA checklist:
   - Buttons respond correctly (desktop/mobile).  
   - Selecting a clip toggles only one entry.  
   - Thumbnail renders for the provided Solana clip.  
   - Chat message sample with `<span class="quote-chip">` renders as expected.

Track progress in this doc as tasks ship. Update the doc with commits and QA notes to keep a running record of the clean-up work.***
