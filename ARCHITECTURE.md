# Architecture

## Overview
`icmfyi/app` is a Next.js App Router frontend and API surface for research chat and clip-assisted workflows.

## Main Components
- UI layer in `app/` + `components/` renders chat, source evidence, clip drawer, and bundle actions.
- Server/API routes in `app/api/` coordinate LLM streaming, retrieval, and sharing endpoints.
- Domain utilities in `lib/` normalize metadata, clip URLs, and typed payload handling.

## Data and Control Flow
1. User submits prompt from chat UI.
2. API route performs retrieval + model streaming and emits answer chunks.
3. Source metadata is parsed into clip/timestamp-aware entries.
4. UI actions can play, edit, and bundle clips for downstream workflows.

## Ops Notes
- Runtime assumes configured model and retrieval provider credentials.
- Use `scripts/knowledge_check.py` to validate repo knowledge-base hygiene.
