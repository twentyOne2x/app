**Source List Refresh — Design Notes**

### 1. Channel Filter UX
- Make the channel filter panel scrollable from the start; the full list should always be reachable with standard scrolling instead of the current “Show all channels” button.
- Hide scrollbars until the user hovers or focuses the list so the visual style stays minimal. Confirm we still expose a visible scrollbar when the user is interacting via keyboard.
- Re-test keyboard navigation (arrow keys, Home/End, page scroll) after the container changes.

### 2. YouTube Thumbnail Parity with mev-fyi
- V1 logging shows `source-list: missing thumbnail for parent`, meaning our `extractYouTubeThumbnail` is failing when links contain timestamp or other query parameters.
- In mev-fyi the metadata path (`components/metadata-list.tsx`) normalises the link by instantiating `new URL(link)` and pulling `searchParams.get('v')`. The resulting `videoId` feeds the canonical `https://img.youtube.com/vi/<id>/hqdefault.jpg` URL regardless of extra params.
- We should mimic that behaviour for both parent videos and clip rows: always derive a clean watch URL, drop `t=` or fragment params, and fall back to the clip’s parent when a watch URL is missing.
- Document the sanitisation steps (strip timestamps, handle youtu.be short links, default to `hqdefault.jpg`). Once implemented the “No preview available” state should disappear except for truly non-YouTube sources.
  - Add a hover/active highlight on each source card (subtle glow/border) to mirror mev-fyi’s “focus” cue.

### 3. Clip Layout Overhaul
- Remove the “See clips” toggle entirely. Each source card should render its clip rows immediately under the video thumbnail.
- Card structure target:
  1. Primary YouTube thumbnail.
  2. Full video title (no truncation) and formatted publish date.
  3. Rows for each clip with bundle toggle, play button, timestamps, and excerpt inline.
- Maintain all clip interactions (playback, add/remove bundle, selection state) in the new layout.

### 4. Diagnostics & Logging
- Keep the temporary `console.debug` statements for missing thumbnails (parent + clip). After we implement the sanitised URL flow they should quiet down; if not, the logs will highlight which sources still need special handling.
- Compare results against mev-fyi after each change to verify parity.
  - Add targeted logging (video link + derived videoId) when thumbnail derivation fails so QA can confirm the sanitisation logic.

### 5. Additional Frontend Refinements
- Clip rows: remove in-row thumbnails, expand the excerpt text on hover, and reposition the “Selected”/“Remove” badges below the clip controls so they no longer overlap Play/Add buttons.
- Fix clip selection leakage: selection should be scoped per clip (no bleeding across clips in the same parent).
- Interaction parity: ensure all CTA buttons (Play, Add/Remove) are reliably clickable by checking stacking contexts and pointer-events.
- Parent card UX: shrink the YouTube thumbnail slightly (keep 16:9 but cap the width), and add a hover highlight to the whole card for better affordance.

Next steps: implement the thumbnail sanitisation, rebuild the source card layout, update the channel filter container, and rerun QA with the logging still enabled. Once parity is achieved, strip the debug output.*** End Patch
