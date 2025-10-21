# icm.fyi Research Chatbot

<a href="https://chat.icm.fyi/">
  <img alt="icm.fyi chat interface" src="https://chat.icm.fyi/opengraph-image.png" />
</a>

Modern RAG assistant for Internet Capital Markets research. The app pairs streaming chat answers with verifiable sources, per-clip tooling, and sharing workflows so analysts can move from a question to actionable video, audio, and document evidence in seconds.

---

## What You Get Today

- **Streaming conversational search** driven by Vercel AI SDK and OpenAI models with Pinecone retrieval.
- **Top Sources panel** summarising every answer with ranked parents, per-clip excerpts, timestamps, and YouTube thumbnails.
- **Clip utilities** `Play clip`, `Edit clip`, and `Add to bundle` actions that open the clip drawer, prefill timestamps, and feed the bundle generator.
- **Shareable chats** with optional Privy/Twitter auth, plus a public share view for curated conversations.
- **Robust metadata parsing** (see [`docs/video-clip-url-spec.md`](docs/video-clip-url-spec.md)) that normalises video IDs, clip URLs, and thumbnails for downstream components.
- **Built-in QA tooling** via debug scripts (`dev_with_rag.sh`, `debug_script.sh`) and selection tests (`tests/clip-selection-hook.test.js`, `tests/query-progress.test.js`).

---

## Audience Guide

### For Researchers & End Users
1. Visit [chat.icm.fyi](https://chat.icm.fyi/) and sign in (Twitter or Privy) to unlock sharing.
2. Ask a question or pick from the default suggestions. Answers stream in with inline call-outs.
3. Use **Top Sources** to open the parent content, play clips at the referenced timestamp, or queue clips into a bundle.
4. Generate/share bundles or chats for follow-up analysis.

### For Developers & Operators
- Expect a modern Next.js 13 app with server components, React Query-style hooks, and Tailwind/shadcn UI.
- Clip state, bundle selection, and metadata parsing live in `lib/` and `components/`.
- Streaming chat relies on `/app/api/chat` routes; source creation/sharing uses `/app/api/create-shared-chat`.
- RAG diagnostics arrive via `diagnostics.final_kept[]` (documented in the new spec) and are transformed by `parseMetadataEntriesV2`.

---

## Architecture at a Glance

| Layer | Highlights |
| --- | --- |
| **UI** | Next.js App Router, server components, shadcn/ui, Tailwind CSS, CSS Modules for complex layouts. |
| **Chat runtime** | Vercel AI SDK streaming, OpenAI GPT models, optional Privy auth, NextAuth session support. |
| **RAG pipeline** | Pinecone vector lookup, AssemblyAI + internal ingestion for multimedia transcripts, heuristics for YouTube IDs/thumbnails. |
| **Clip tooling** | `ClipDrawer`, `ClipBundleBar`, `useClipSelection` hook, reusable playback builder. |
| **Docs & QA** | Structured design docs in `/docs`, scripts for local debugging, Node test suites for selection and markdown sanitisation. |

---

## Getting Started (Developers)

### Prerequisites
- Node.js **22.x** (see `package.json` engines field).
- pnpm 8.x (recommended) or npm/yarn.
- Access credentials for: OpenAI (or configured LLM), Pinecone, AssemblyAI, NextAuth/Privy providers.

### Environment Configuration
1. Copy `.env.example` → `.env`.
2. Fill in API keys and auth secrets (OpenAI/Pinecone/AssemblyAI/NextAuth, Privy).  
   - The backend expects environment variables referenced in `auth.ts`, `app/api/**`, and `lib/constants.ts`.

### Install & Run
```bash
pnpm install
pnpm dev
# App boots on http://localhost:3000
```

To verify changes:
```bash
pnpm lint            # ESLint (Next.js preset + Tailwind rules)
pnpm type-check      # TypeScript in --noEmit mode
pnpm test:progress   # Node test runner (clip selection, markdown sanitisation, etc.)
```

For production builds:
```bash
pnpm build
pnpm start
```

---

## Development Workflow Hints

- **Clip/Source rendering** lives in `components/source-list.tsx` and `components/metadata-list.tsx`. Both rely on `ParsedMetadataEntryV2`.
- **Markdown rendering** is defined in `components/chat-message.tsx`; we removed `remark-math` to prevent dollar values from being misinterpreted.
- **Bundle selection state** uses `lib/hooks/use-clip-selection.ts` backed by local storage.
- **Auth & routing**: see `app/layout.tsx`, `middleware.ts`, and `auth.ts`.
- **Debugging ingestion**: scripts `dev_with_rag.sh`, `debug_script.sh`, and docs under `/docs` describe ingestion quirks and upcoming work.

---

## Deployment Notes

- First-party deployment happens on Vercel.  
- When cloning with the “Deploy with Vercel” button, double-check that the required secrets (OpenAI, Pinecone, AssemblyAI, NextAuth/Privy) are added to the project.  
- Production builds rely on Edge-friendly code paths; avoid introducing Node-only APIs into shared components.

---

## Troubleshooting & Observability

- **Missing thumbnails**: Check console warnings in `components/source-list.tsx`; they call out unexpected `clip.thumbnailUrl` gaps.
- **Clip actions not clickable**: Ensure CSS stacking contexts in `source-list` remain aligned (`pointer-events` override + `z-index`).
- **Source badges overflowing**: See adjustments in `components/MetadataList.module.css` and `app/globals.css`.
- **Markdown oddities**: Reference `tests/markdown-sanitize.test.mjs` to confirm sanitisation behaviour.

---

## Additional Documentation

- [`docs/video-clip-url-spec.md`](docs/video-clip-url-spec.md) — canonical guide to video IDs, clip URLs, and thumbnail derivation.
- `docs/clip-interaction-ux-refresh.md`, `docs/source-list-refresh-design.md` — design goals and QA checklists for clip workflows.
- `docs/hq-clip-roadmap.md`, `docs/clip-followup-tasks.md` — roadmap items and open tasks.

---

## Appendix — Repo Evolution

### Executive Snapshot

| Aspect | First Commit `d9858e0` | Current `HEAD` |
| --- | --- | --- |
| **Brand & Scope** | “MEV.fyi Chatbot” marketing page; generic LlamaIndex phrasing | Production `icm.fyi` research companion with explicit clip/bundle workflows |
| **Architecture** | Static marketing README; implied single Next.js chat surface | Next.js 13 App Router app with server components, streaming chat, share routes, bundle drawers, Privy/Twitter auth |
| **Source Rendering** | No implementation details; assumed plain list of links | `SourceList` + `MetadataList` components with thumbnails, per-clip actions, selection state, toast feedback |
| **Clip Experience** | Not mentioned | `ClipDrawer`, HQ generation hooks, bundle selection (`useClipSelection`), timestamp editing, diagnostic logging |
| **Data Handling** | Promised research papers/Twitter threads; stored thousands of PNG thumbnails + `docs_mapping.json` | Lean YouTube-first pipeline, deterministic thumbnail fallbacks, structured metadata parsing (`parseMetadataEntriesV2`), documented `diagnostics.final_kept[]` schema |
| **Docs & Specs** | README only (deployment + “default questions”) | Roadmaps and UX briefs in `/docs`, video/clip URL spec, onboarding guidance for researchers and developers |
| **Tooling & Tests** | None referenced | Node test suite (`test:progress`), clip selection/markdown tests, debug scripts (`dev_with_rag.sh`, `debug_script.sh`), lint/type-check workflows |
| **Auth & Sharing** | Mentioned NextAuth generically | Privy/Twitter sign-in, share chat header, public share routes, middleware gating |
| **Asset Footprint** | ~13k research paper PNGs shipped in repo | Legacy assets removed; thumbnail logic now fetches from YouTube or defaults |

### Highlights Since the First Commit

- Streamlined metadata ingestion: `lib/utils.ts` normalises clip/video IDs, timestamps, scores, and derived thumbnails.
- Comprehensive clip UX including playable timestamps, edit drawer with padding controls, bundle bar/drawer, and “add to bundle” selection persistence.
- Formalised diagnostics contract (`docs/video-clip-url-spec.md`) so frontend and backend agree on `diagnostics.final_kept[]`.
- Modernised README with user/dev workflows, architecture overview, troubleshooting, and deployment guidance.
- Markdown rendering hardened (span sanitisation, removal of `remark-math` to stop dollar amounts from becoming math blocks).
- Cleanup of obsolete research-paper thumbnail infrastructure (`public/research_paper_thumbnails`, `docs_mapping.json`) replaced with dynamic fallbacks.
- Added regression coverage (clip selection hook, query progress normalisation, markdown sanitisation) and ensured `pnpm test:progress` stays green.
- Utility scripts and docs to debug ingestion (`dev_with_rag.sh`, `debug_script.sh`) and plan future clip UX (`docs/clip-interaction-ux-refresh.md`, `docs/source-list-refresh-design.md`).

### Troubleshooting

- **Missing clip thumbnails:** confirm video IDs/URLs flow into `ParsedMetadataEntryV2`; fallback defaults to `/default-thumbnail.jpg`.
- **Metadata excerpts showing bracketed speaker/time:** `sanitizeClipExcerpt` strips `[A | hh:mm:ss]` patterns—if they reappear, check backend formatting.
- **Buttons unclickable:** ensure `components/source-list.tsx` `z-index` overrides remain; hover overlays can swallow pointer events if altered.
- **Markdown rendering oddities:** run `pnpm test:progress`; the markdown sanitisation test matches runtime configuration.

### Scripts & Utilities

- `dev_with_rag.sh` – launch local dev server with environment setup for RAG testing.
- `debug_script.sh` – helper script for debugging metadata ingestion.
- `tests/clip-selection-hook.test.js` – verifies bundle selection persistence.
- `tests/query-progress.test.js` – validates progress normalisation.
- `tests/markdown-sanitize.test.mjs` – ensures Markdown sanitiser matches renderer.

### Notes & Responsibilities

- Respect content licensing when replaying or sharing YouTube clips; Privy/Twitter auth gates sharing features.
- HQ clip generation (AssemblyAI) may incur cost; adjust concurrency and padding defaults accordingly.
- Query diagnostics power UI; backend changes to `diagnostics.final_kept[]` must be mirrored in the spec and parser.

### Acknowledgements

- Vercel AI SDK for streaming chat.
- shadcn/ui, Tailwind CSS, Radix UI for component primitives.
- Pinecone & AssemblyAI for retrieval and media processing backends.
  