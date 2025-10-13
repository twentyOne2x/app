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

## Appendix: Platform Evolution Since Initial Commit

### Executive Summary
- **Scope shift:** the product evolved from a generic MEV.fyi chatbot (commit `d9858e0`) into a clip-centric icm.fyi research companion with bundle workflows, shareable chats, and Privy/Twitter auth.
- **Data focus:** research-paper thumbnail infrastructure was removed in favour of normalised YouTube metadata (`ParsedMetadataEntryV2`, `docs/video-clip-url-spec.md`) and deterministic thumbnail fallbacks.
- **Developer tooling:** the repo now includes clip selection hooks, regression tests, dedicated debug scripts, Markdown sanitisation hardening, and detailed documentation that did not exist in the first commit.

### What Exists in the Current Repo
- **User-facing**
  - Top Sources panel with per-clip controls (`Play`, `Edit`, `Add to bundle`) and score badges.
  - Clip Drawer with timestamp editing, HQ generation hooks, and bundle orchestration.
  - Share chat header + public share routes, Privy/Twitter authentication, and bundle drawers/bars.
  - Responsive UI polish: wrapping metadata excerpts, accessible hover states, improved thumbnails.
- **Data & Retrieval**
  - Structured metadata parsing (`parseMetadataEntriesV2`) with canonical video IDs, clip URLs, and score handling.
  - YouTube thumbnail derivation, doc mapping removal, and default fallbacks for non-video sources.
  - Diagnostics spec for `diagnostics.final_kept[]` documented in `docs/video-clip-url-spec.md`.
- **Developer Experience**
  - Tailwind/shadcn component library usage, CSS modules per surface, and design docs under `/docs`.
  - Local scripts (`dev_with_rag.sh`, `debug_script.sh`) plus selection + markdown tests (`tests/clip-selection-hook.test.js`, `tests/markdown-sanitize.test.mjs`, `tests/query-progress.test.js`).
  - Updated README structure with role-specific guidance, architecture overview, and troubleshooting notes.

### Legacy Snapshot (Initial Commit `d9858e0`)

| Area | Initial State |
| --- | --- |
| **Branding** | “MEV.fyi Chatbot” linking to `chat.mev.fyi`. |
| **Features** | High-level bullet list (Next.js, Vercel AI SDK, gpt-3.5 support, shadcn UI, NextAuth, rate limiting). |
| **Content claims** | Emphasised broad coverage (YouTube transcripts, research papers, podcasts, author index). |
| **Docs & Tooling** | Only sections for default questions, deployment button, and local dev steps; no platform-specific workflows, scripts, or specs. |
| **Assets** | Relied on static research paper thumbnails (`public/research_paper_thumbnails`) and `docs_mapping.json` to map document URLs. |

Key differences compared to today:
- No mention of clip bundles, clip editing, or shareable chats.
- No explicit diagnostics guidance or metadata schema references.
- Auth options, debug scripts, and component-level UX improvements were absent.
- README was descriptive but not actionable for operators or contributors.

This appendix should help new maintainers contextualise the current surface area against the original scope.
