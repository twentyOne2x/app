# High-Resolution Clip Extraction & Library Experience

> ✅ = complete · ⬜️ = outstanding · 🔄 = in progress  
> Track progress by checking items as they ship. Each item calls out the tests that must pass before marking it done.

---

## Phase A — Smart Padding & Inline Playback

Tech stack: **Next.js 13 + React 18 (TypeScript)**. State stored via React hooks + local storage.

| Status | Item | Tests |
| --- | --- | --- |
| ✅ | Add padding controls to clip drawer (toggle “Smart context” vs manual seconds, ±5s presets, numeric inputs). | - Node test + React Testing Library (`tests/clip-padding-hook.test.js`) exercises smart/manual toggle, preset inputs, and persistence.<br>- Axe scan still pending if we want automated coverage. |
| ✅ | Persist padding preferences per clip (`segment_id`) in React state/local storage. | - React Testing Library flow re-renders drawer and asserts values restored from `localStorage`. |
| ✅ | Maintain YouTube preview while other UI updates occur. | - Manual verification: old behavior unchanged.<br>- Playwright: open drawer, preview still playable. |

---

## Phase B — HQ Clip Service (Single Clip Workflow)

### Backend (Cloud Run, Python/FastAPI)

Tech stack: **Python 3.11**, **FastAPI**, packaged with **ffmpeg** in a Docker image, deployed to **Google Cloud Run**. Queue handled by **Cloud Tasks** (or Pub/Sub). Persistent storage on **Google Cloud Storage (GCS)**; status metadata in **Firestore** or GCS object metadata.

| Status | Item | Tests |
| --- | --- | --- |
| 🔄 | Implement `POST /clips` accepting `{parent_id, segment_id, start_s, end_s, pad_before, pad_after, context_mode}` with auth (service token). | - Pytest: schema validation, missing params rejected.<br>- Integration: `curl` with signed token returns `{"id":..., "status":"queued"}`. |
| 🔄 | Implement `GET /clips/:id` returning `{status, stream_url?, download_url?, progress?, error?}`. | - Pytest: returns queued/processing/ready statuses.<br>- Integration: fetch ready clip, verify URLs signed. |
| 🔄 | Job runner: resolve storage URI, apply padding/context logic, run ffmpeg, upload MP4 + optional HLS, store status. | - Unit: ffmpeg command builder given start/end/pad.<br>- Unit: sentence snapping uses `sentence_offsets` correctly.<br>- Integration: end-to-end job with sample MP4 stored in staging bucket (assert output clip duration). |
| ✅ | Deduplicate clips via hash `(parent_id, start, end, pad_before, pad_after, context_mode)` to reuse existing outputs. | - Node test (`tests/clip-local-service.test.js`) calls `enqueueLocalClipJob` twice and awaits completion to confirm reuse + ready URLs. |
| ✅ | Security: enforce service-to-service auth (signed JWT or API key). | - FastAPI now honors `CLIP_SERVICE_AUTH_TOKEN` / `CLIP_SERVICE_TOKEN` and rejects missing/invalid bearer headers.<br>- Pytest coverage: [`clip-service/tests/test_auth.py`](https://github.com/twentyOne2x/clip-service/blob/main/tests/test_auth.py) exercises 401 vs 200 flows with the TestClient. |

> **Note:** The FastAPI implementation now lives in a dedicated repository [`twentyOne2x/clip-service`](https://github.com/twentyOne2x/clip-service). It downloads sources (yt-dlp or GCS), deduplicates payloads, and serves finished clips at `/clips/{id}/file`. The Next.js proxy rewrites those relative URLs to `/api/clips/{id}/stream` so the web app can stream/download without CORS issues.

**Deployment status**
- Container image: `gcr.io/just-skyline-474622-e1/clip-service`
- Cloud Run service URL: `https://clip-service-406386298457.us-central1.run.app`
- Required env vars for clients:
  - `CLIP_SERVICE_URL=https://clip-service-406386298457.us-central1.run.app`
  - `CLIP_SERVICE_TOKEN=<current bearer token>` (set in Cloud Run as `CLIP_SERVICE_AUTH_TOKEN`)
- Frontend `/api/clips` proxy already reads these values; set them in your local/Vercel environment to route requests to Cloud Run.

### Frontend (Next.js)

Tech stack: **Next.js 13**, **React 18**, **TypeScript**, using SWR-style polling or custom hooks for async fetch. Video playback via **hls.js** for HLS streams and native `<video>` for MP4.

| Status | Item | Tests |
| --- | --- | --- |
| 🔄 | “Generate HQ” button triggers POST, disables controls, shows spinner. | - Jest: button shows loading state when request in flight.<br>- Playwright: user clicks generate, spinner appears. |
| 🔄 | Poll GET `/clips/:id` with exponential backoff until `ready`/`error`. | - msw integration tests: mock queued→ready transitions; ensure poll stops after success/error.<br>- Jest: polling stops when `status === "error"`. |
| 🔄 | Display results: replace placeholder assistant bubble with “Play HQ” (HLS if available) + “Download MP4”. | - Jest: when diagnostics include URLs, message renders video/download buttons.<br>- Playwright: user clicks download, file stream initiated. |
| 🔄 | Cache `clip_id` for identical parameters to avoid duplicate requests. | - Jest: cache key derived from `(segment_id, pad_before, pad_after, context_mode)`.<br>- Playwright: repeat request doesn’t re-trigger POST (assert via msw call count). |

---

## Phase C — Batch Clips & Library

Tech stack: same as Phase B; library view uses Next.js pages/components, persistent selection stored in Vercel KV or local storage.

| Status | Item | Tests |
| --- | --- | --- |
| ✅ | Add checkboxes to clip cards; maintain selection per chat (KV/local storage). | - Node test (`tests/clip-selection-hook.test.js`) drives the shared selection hook and verifies persistence across renders.<br>- UI now shows inline checkboxes plus a persistent selection bar with clear action. |
| 🔄 | Library UI: dedicated panel listing saved clips (title, start–end, speaker, channel). | - Pending: surface dedicated library view populated from the shared selection store. |
| ⬜️ | Batch API: `POST /clips/batch` → returns `batch_id`; `GET /clips/batch/:id` → per-clip statuses, aggregate status. | - Pytest: payload validation; integration ensures worker enqueues all items.<br>- Load: k6 test with ~20 clips ensures queue handles it. |
| ⬜️ | Batch ZIP assembly & download link. | - Integration: after clips ready, zipped file stored & signed URL returned.<br>- Playwright: user downloads ZIP, file contains expected MP4s. |

---

## Phase D — Transcript-Aware Context (Optional Upgrade)

Tech stack: extend ingestion pipeline (likely Python with Whisper/ASR). Clip service (FastAPI) consumes new sentence metadata.

| Status | Item | Tests |
| --- | --- | --- |
| ⬜️ | Ingest pipeline stores `sentence_offsets` per parent (start/end/text). | - Ingest unit test: sentences exported with timestamps.<br>- Manual spot check vs transcript. |
| ⬜️ | Clip service uses sentence boundaries when `context_mode='sentence'`. | - Pytest: given offsets, returns correct padded span.<br>- Integration: clip trimmed to full sentences. |
| ⬜️ | (Optional) Drawer displays the context sentences included. | - Jest: UI renders additional sentence text.<br>- Accessibility: screen readers announce context block. |

---

## Metadata & Storage Enhancements

Tech stack: ingestion pipeline in **Python** updates Pydantic models (`ParentNode`, `ChildNode`); data stored in GCS / Firestore.

| Status | Item | Tests |
| --- | --- | --- |
| ⬜️ | Add `storage_object_uri`, `raw_duration_s` to ParentNode. | - Schema tests: new fields persisted during ingest.<br>- Migration script loads existing parents, populates fields. |
| ⬜️ | Add `thumbnail_url`, `hq_clip_meta` to ChildNode. | - Schema tests: defaults don’t break existing code.<br>- UI renders thumbnails when available. |

---

## Clip Service Technical Tasks

Tech stack summary: Dockerized FastAPI app with ffmpeg, deployed on Cloud Run. Queue via Cloud Tasks. Signed URLs generated using Google Cloud Storage client libraries.

| Status | Item | Tests |
| --- | --- | --- |
| ⬜️ | Package Cloud Run container with ffmpeg + FastAPI. | - Docker build passes; smoke test: `curl /healthz`. |
| ⬜️ | Configure Cloud Tasks or Pub/Sub queue. | - Deploy script sets up queue; integration test publishes/consumes message. |
| ⬜️ | Signed URL generation for clip download/stream. | - Pytest: signed URL expires after configured interval.<br>- Integration: browser can access clip via signed URL; unauthorized request denied. |
| ⬜️ | Monitoring: log job duration, failures, integrate with Cloud Logging alerts. | - Manual: log entries include job_id and status.<br>- Alert: error rate > threshold triggers notification. |

---

## Analytics & Telemetry

Tech stack: frontend logs events via Next.js API route (`/api/analytics`) to **BigQuery** (or Firestore). Dashboard with **Looker Studio** or **Metabase**.

| Status | Item | Tests |
| --- | --- | --- |
| ⬜️ | Log query submissions (profile, filters, hashed prompt). | - Jest: analytics function called on submit.<br>- Integration: event written to BigQuery/Firestore. |
| ⬜️ | Log clip requests/completions/errors with durations. | - Cloud Run logs include request_id, duration.<br>- BigQuery table receives `clip_id`, `status`. |
| ⬜️ | Dashboard summarizing top channels / clips / searches. | - Metabase (or Looker Studio) chart rendering sample data.<br>- QA: dashboard updates with new entries daily. |

---

## Testing Checklist (by layer)

| Layer | Required Tests Before Release |
| --- | --- |
| Frontend | ESLint, `pnpm test:progress`, Jest suites for clip drawer + caching, Playwright smoke (single clip). |
| Backend | Pytest unit, integration tests hitting staging GCS, end-to-end job validation, load/leak tests. |
| Security | Ensure Cloud Run requires auth, no anonymous clip generation. |
| Accessibility | Run axe on drawer/library interfaces. |

---

## Deployment & Ops

| Status | Item | Tests |
| --- | --- | --- |
| ⬜️ | Dev/staging/prod environment separation (env vars, buckets, queues). | - Manual: deploying to staging uses staging GCS bucket.<br>- Secrets managed via Google Secret Manager / Vercel env. |
| ⬜️ | CI pipeline (GitHub Actions) running lint, unit, Playwright smoke on each PR. | - CI logs show green build; PR blocked if failing. |
| ⬜️ | Alerting for clip failures, queue backlog, storage quotas. | - Configure alert policy in Cloud Monitoring; simulate failure to verify. |

---

## Timeline (T-Shirt Estimates)

| Phase | Estimate | Notes |
| --- | --- | --- |
| Metadata update | 1 week | Add storage URIs, sentence offsets. |
| Phase B (MVP) | 2–3 weeks | Includes Cloud Run API, worker, frontend integration. |
| Phase A polish | 3–4 days | Can run in parallel with backend work. |
| Phase C (batch) | 2 weeks | After MVP stable. |
| Analytics logging | Ongoing | Start early, iterate. |
| Transcript snapping | 1 week | Depends on sentence offsets availability. |

---

## Open Decisions

- HLS vs MP4: support both (HLS for streaming, MP4 for download).
- Signed URL TTL: default 1 hour; refresh via API as needed.
- Clip retention: consider auto-cleanup >30 days unless bookmarked.
- User quotas: optional per tester to manage compute costs.

---

## Future Enhancements

- AI summaries/descriptions for saved clips.
- Collaboration: share clip bundles.
- Integrations: Zapier/Notion hooks.
- Mobile-friendly download options (720p MP4).

---

Update this checklist as work progresses. Mark items ✅ once code, tests, and deployment are complete.***
