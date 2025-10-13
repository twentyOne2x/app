# Video & Clip URL Retrieval Spec

This document explains how the frontend should consume metadata returned by the chat APIs in order to surface per-source video links, clip timestamps, and YouTube thumbnails. It complements the helpers already defined in `lib/utils.ts`, `components/source-list.tsx`, and `components/metadata-list.tsx`.

---

## 1. Where to Read Link Data

| Endpoint | Field | Notes |
| --- | --- | --- |
| `POST /chat` | JSON response → `diagnostics.final_kept[]` | Canonical payload used for rendering and bundling. |
| `POST /chat/stream` | Final SSE event → `diagnostics.final_kept[]` | Mirrors the non-streaming payload; intermediate `kept_sources` events can be ignored once the final payload arrives. |

Each element inside `diagnostics.final_kept[]` represents a *clip node*. Multiple nodes with the same `parent_id` belong to the same video/source.

```jsonc
{
  "segment_id": "SOMETOKEN",          // unique clip id
  "parent_id": "CEuKahqOYbs",         // canonical YouTube id
  "video_id": "CEuKahqOYbs",          // alias of parent_id
  "document_type": "youtube_clip",
  "score": 0.8123,
  "published_at": "2024-05-03T00:00:00Z",
  "is_explainer": false,
  "router_boost": null,
  "entities": ["Kyle Samani"],
  "speaker": "Threadguy",
  "chapter": "Aster Overview",
  "start_hms": "00:12:34",
  "end_hms": "00:15:22",
  "start_seconds": 754,
  "clip_url": "https://youtu.be/CEuKahqOYbs?t=754",
  "url": "https://www.youtube.com/watch?v=CEuKahqOYbs",
  "title": "Scale or Die at Accelerate 2025",
  "channel_name": "ICM Research",
  "channel_id": "UC123456789",
  "parent_channel_name": "ICM Research",
  "parent_channel_id": "UC123456789",
  "text_preview": "“You've been with Anza for a long time...”"
}
```

---

## 2. Parsing on the Frontend

Use the existing `parseMetadataEntriesV2` helper in `lib/utils.ts` to transform the raw diagnostics array into `ParsedMetadataEntryV2[]`. The helper:

1. Normalises titles and dates.
2. Groups clips by `parent_id`/`title`.
3. Splits clip-level fields into `ClipItemV2`.
4. Ensures `clip.videoId`, `clip.clipUrl`, and `entry.videoId` are populated when present.

If you need to wire a new consumer, mirror this function rather than inspecting the raw SSE payload inside UI components.

Key types (abridged):

```ts
interface ClipItemV2 {
  parentTitle: string;
  segmentId?: string;
  videoId?: string;      // ← Use this for thumbnails when available
  clipUrl?: string;      // ← Per-clip URL (may include timestamp)
  url?: string;          // ← Fallback to parent URL
  startHMS?: string;
  endHMS?: string;
  startS?: number;
  endS?: number;
  excerpt?: string;
  thumbnailUrl?: string; // Provided when backend precomputes
}

interface ParsedMetadataEntryV2 {
  parentTitle: string;
  channel: string;
  url?: string;          // Base source URL
  videoId?: string;      // Canonical video id, mirrors `parent_id`
  thumbnailUrl?: string;
  clips: ClipItemV2[];
}
```

---

## 3. Building Watch Links

Always prefer the backend-supplied `clip_url`. Only fall back to `url` + timestamp parameters when `clip_url` is missing:

```ts
const baseUrl = clip.clipUrl ?? clip.url ?? parent.url ?? '#'

const startSeconds =
  clip.startS ??
  hmsToSeconds(clip.startHMS) ??
  null

const watchUrl =
  startSeconds != null && !baseUrl.includes('t=')
    ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}t=${startSeconds}s`
    : baseUrl
```

For editing workflows (`ClipDrawer`), the helper `buildClipPlayback(parent, clip)` already handles:

- Generating a `watchUrl` and `embedUrl`.
- Respecting non-YouTube providers by appending `?start=` when necessary.

Reuse that helper instead of rebuilding the logic in components.

---

## 4. Deriving YouTube Thumbnails

Thumbnail priority order:

1. `clip.thumbnailUrl` (provided by backend).
2. `entry.thumbnailUrl`.
3. YouTube ID derived from the best available URL.
4. Fallback image (`/default-youtube-thumbnail.jpg`).

When deriving IDs, use the same logic as `extractYouTubeThumbnail` in `components/source-list.tsx`:

```ts
function deriveYouTubeId(rawUrl?: string, fallback?: string | null) {
  if (!rawUrl && !fallback) return null
  try {
    const parsed = rawUrl ? new URL(rawUrl) : null
    if (parsed?.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '').split('?')[0] || fallback || null
    }
    if (parsed?.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v') ?? fallback ?? null
    }
  } catch {
    // ignore invalid URLs
  }
  return fallback ?? null
}

const videoId =
  deriveYouTubeId(clip.clipUrl, clip.videoId ?? entry.videoId) ??
  deriveYouTubeId(entry.url, entry.videoId)

const thumbnailUrl = videoId
  ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  : '/default-youtube-thumbnail.jpg'
```

This ensures that even if the backend omits `thumbnail_url`, the UI can recover using either `clip_url`, `url`, or the explicit `video_id`.

---

## 5. Validation Checklist

Before merging any parser or UI change, verify the following scenarios:

1. **Pure YouTube clip** – `clip_url` present with timestamp. Ensure link opens at the right second and the thumbnail shows.
2. **YouTube clip with only `url`** – timestamps derived from `start_hms`.
3. **Non-YouTube source** – `clip_url` missing, ensure no `t=` parameter is appended; thumbnails should fall back gracefully.
4. **Missing video id** – confirm we still render using default thumbnail and link.
5. **Multiple clips per parent** – ensure grouping is stable and `entry.videoId` is consistent across clips.

When debugging payload mismatches, log the raw node and confirm:

```ts
console.debug('node diagnostics', {
  segmentId: node.segment_id,
  parentId: node.parent_id,
  clipUrl: node.clip_url,
  url: node.url,
  start: node.start_seconds ?? node.start_hms,
})
```

Keep these logs temporary; the long-term fix should rely on the helpers noted above.

---

## 6. References

- `lib/utils.ts` — `parseMetadataEntriesV2`, `ClipItemV2`
- `components/source-list.tsx` — `extractYouTubeThumbnail`, `buildClipPlayback`
- `components/metadata-list.tsx` — YouTube ID extraction fallback logic
- `components/clip-drawer.tsx` — Playback builder used in the clip editor

Following this spec guarantees the frontend consistently resolves clip URLs, timestamps, and thumbnails across both streaming and non-streaming chat responses.
