# Progress & Clips UX Fixes — Design Doc

## Context
Recent feedback highlighted multiple regressions across the chat progress indicator, clip browsing experience, and stream shutdown workflow. The issues combine to create confusing status updates, broken navigation, and unusable clip previews. This doc lists the problems, desired behavior, and the concrete TODOs we need before touching code.

## Issues & Goals
1. **Progress Labels Too Technical**  
   - Current labels append backend identifiers like `(rerank_cross_encoder)` which leak implementation details.  
   - Goal: Display plain-English labels only, while still mapping backend keys internally.

2. **Links Reuse Current Chat Context**  
   - Any link interaction (e.g., source link, new conversation prompt) should open in a fresh chat instead of reusing the active thread.  
   - Goal: Ensure UI actions that spawn chats create a new conversation ID and route accordingly.

3. **Clip Rows Not Clickable**  
   - Clip call-to-actions (expand, play, add-to-bundle) are failing; likely due to overlapping elements or event handling regressions.  
   - Goal: Restore reliable click interactions for every clip row.

4. **Lack of Inline Thumbnails**  
   - Users want to see YouTube thumbnails in the collapsed clip view, matching the behaviour at https://github.com/mev-fyi/app.  
   - Goal: Show per-clip thumbnails by default, without requiring expansion.

5. **Stream Continues After Chat Reset**  
   - Clearing the chat (broom icon) while an answer is streaming keeps the backend query running and UI spinner active.  
   - Goal: Abort in-flight streams, stop progress indicators, and reset state immediately when the chat is cleared.

## TODO Breakdown
### Progress Indicator
- Strip backend key suffixes from rendered labels (UI + exported helpers).
- Keep key metadata internally for debugging (e.g., tooltip or data attribute) if needed.
- Ensure stage order + counters stay accurate with the simplified labels.

### Link Handling
- Audit components that trigger chat navigation (source links, related-question buttons, footer prompts).  
- Update handlers to create/open a new chat route instead of mutating the current thread.
- Verify share/open-source links still open in a separate browser tab where applicable.

### Clip Interaction Fix
- Inspect DOM/CSS stacking to identify why buttons aren’t receiving clicks.  
- Adjust layout or event handlers so clip rows remain interactive on desktop + mobile.  
- Add regression test coverage (e.g., RTL) if feasible.

### Inline Thumbnails
- Fetch/derive thumbnail URLs (prefer existing metadata).  
- Render thumbnail preview within the collapsed clip row, falling back to placeholder when missing.  
- Ensure performance (lazy loading, proper sized container).

### Stream Abort on Reset
- Hook into the “clear chat” action to abort any active fetch/stream controller.  
- Reset progress state + spinners immediately after aborting.  
- Confirm no residual messages append after reset.

## Validation Plan
- Manual regression pass: progress counter, clip interactions, inline thumbnails, clearing mid-stream.  
- Automated tests: extend existing progress utilities tests; consider UI tests for clip interactions if practical.  
- Compare clip UX with mev.fyi implementation for parity.

## Open Questions
- Should we provide an advanced-mode toggle to expose backend stage keys for debugging?  
- Do we need analytics or logging updates when aborting streams on clear?

Feedback welcome before implementation.
