# Word-Level Clip Editor Design

## Overview
We want an editing surface that lets operators trim clips using the diarized word stream we already receive from AssemblyAI. Instead of guessing timestamps, editors can scrub through the transcript, see who is speaking, and set the start/end of a clip by selecting ranges of words.

The experience should work alongside the existing clip drawer: when a user clicks **Edit clip**, they can toggle into the "Transcript" tab, view the conversation segmented by speaker, drag handles to include or exclude words, and immediately preview/export the resulting timeline. This document describes the UX, data requirements, backend contracts, and incremental rollout plan.

## Goals
- Provide a reliable, low-latency way to adjust clip boundaries without typing timestamps.
- Expose the diarized transcript (speaker + word + timestamp) the ingestion stack already stores.
- Maintain parity with the current HQ clip pipeline (single clip + bundle) so the same generate/download actions work once the boundaries are updated.
- Keep the UI responsive on chats with long transcripts (up to ~15 minutes of audio).

### Non-goals
- Full waveform editing or multi-track mixing.
- Manual transcript corrections; we will treat the AssemblyAI output as authoritative for now.

## Data model and APIs
We already persist diarized JSON in the warehouse. Each segment contains:

```json
{
  "speaker": "SPEAKER_1",
  "start": 12.345,
  "end": 15.210,
  "words": [
    { "text": "hello", "start": 12.345, "end": 12.7 },
    { "text": "everyone", "start": 12.8, "end": 13.2 }
  ]
}
```

New requirements:

1. **Transcript endpoint** – `/api/clips/transcript?videoId=...&segmentId=...` (server action or route handler) that returns the diarized blocks for the selected clip source. We can surface existing metadata via KV or the YouTube warehouse service. The response should include:
   - `segments`: ordered list of speakers, each with their words and timestamps
   - `duration`: total duration for range validation
   - `confidence`: optional quality metric for future UX nudges

2. **Word range payload** – the clip drawer should send an array of word indices when updating the clip. Example:

```json
{
  "clipId": "abc123",
  "wordRange": { "startWordId": "w-102", "endWordId": "w-135" },
  "padBefore": 2.0,
  "padAfter": 2.0
}
```

The backend converts this range to precise timestamps before calling the clip service.

3. **Local word index** – to avoid large payloads, compute a deterministic `wordId` by concatenating `segmentId` + word offset. The frontend only needs to know the first/last selected word and can fetch surrounding context as needed.

## UX flow
1. User opens **Edit clip**. Default view stays the existing video preview + timing summary.
2. New "Transcript" tab shows a vertically scrollable list:
   - Speaker label chip (color-coded)
   - Word chips grouped into sentences
   - Hovering a word previews the corresponding timestamp in the video (seek).
3. Slider handles:
   - Left handle snaps to the beginning of a word; right handle snaps to the end.
   - Dragging updates the preview video start/end markers live.
   - Keyboard shortcuts (`[` and `]`) nudge handles by one word.
4. When the selection changes, we recompute `startSeconds`/`endSeconds` and update the `useClipGeneration` store.
5. The existing "Generate high-quality clip" button remains; once the clip is ready, we auto-download (new behaviour).

### Visual considerations
- Use virtualized rendering for transcripts > 5k words.
- Highlight the active selection with a filled background; outside words remain muted.
- Provide a mini-map timeline above the transcript showing the current selection vs. full duration.

## Implementation plan
1. **Backend transcript route**
   - Add server action `getTranscript(videoId, segmentId)` that queries the diarization indexer (Cloud Run) or BigQuery table.
   - Response caches in KV for 5 minutes to avoid repeated lookups.
2. **Frontend data layer**
   - New hook `useTranscript(videoId, segmentId)` with SWR for caching.
   - Normalise words into a flat array of `{ id, speaker, text, start, end }` plus derived sentence boundaries.
3. **Transcript UI**
   - Create `TranscriptEditor` component using `react-virtualized` (already in node_modules? If not, pick lightweight virtual list) with custom word chips.
   - Implement selection state using two indices; expose callbacks `onRangeChange(startIndex, endIndex)`.
   - Integrate with existing `useClipPadding` so the padding controls still apply.
4. **Timestamp conversion**
   - Whenever the range changes, update `clip.startS`/`clip.endS` in the selection store and mark `timingFallback=false`.
   - For bundle payloads, include the precise timestamps so the clip service does not need to infer.
5. **Testing**
   - Unit tests for range → timestamp conversion (edge cases: overlapping speakers, gaps, missing diarization).
   - Playwright regression: select a word range, generate HQ clip, confirm auto-download triggered.

## Open questions
- How do we handle diarization gaps or overlapping speakers? Initial approach: fall back to original clip timestamps if the computed range is < 1s.
- Should we surface confidence scores from AssemblyAI to warn about low-quality segments?
- Do we need analytics for selection usage (e.g., number of adjustments before saving)?

## Rollout
1. Ship backend transcript endpoint + basic transcript viewer (read-only).
2. Add selection handles + clip start/end updates.
3. Enable HQ clip generation from word selection.
4. Extend bundle flow to honour new timestamps.

Each phase should land behind a feature flag (`TRANSCRIPT_EDITOR_ENABLED`) so we can shadow test with internal users before rolling out broadly.
