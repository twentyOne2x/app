export type RoadmapStatus = 'in-progress' | 'not-started' | 'done'

export interface RoadmapPhase {
  id: number
  title: string
  scope: string
  backendAlignment: string
  status: RoadmapStatus
  notes: string
}

export const FRONTEND_ROADMAP: RoadmapPhase[] = [
  {
    id: 0,
    title: 'Phase 0 · Structured Metadata UI',
    scope: 'Parent/clip source list, inline playback groundwork',
    backendAlignment: 'Step 2.1 parent/child + clip schema',
    status: 'in-progress',
    notes: 'Expandable parents, clip drawer, YouTube playback'
  },
  {
    id: 1,
    title: 'Phase 1 · Clip Service MVP',
    scope: 'Generate HQ flow wired to Cloud Run clipper',
    backendAlignment: 'Phase 1 minimal clip service',
    status: 'not-started',
    notes: 'POST/GET clip API integration with polling'
  },
  {
    id: 2,
    title: 'Phase 2 · Router & Namespaces',
    scope: 'Scope toggles, definition mode, hint wiring',
    backendAlignment: 'Router namespaces split',
    status: 'not-started',
    notes: 'All/Videos/Streams filter + badges per parent'
  },
  {
    id: 3,
    title: 'Phase 3 · Rerank & Signals',
    scope: 'Confidence bars + “why this source” cues',
    backendAlignment: '2.2 CE rerank + boosts',
    status: 'not-started',
    notes: 'Visualize rank_score + boosts metadata'
  },
  {
    id: 4,
    title: 'Phase 4 · Clip Library & Exports',
    scope: 'Save clips, batch HQ generation, share bundles',
    backendAlignment: 'Clip product track 9.x',
    status: 'not-started',
    notes: 'Library view, bulk download/zip, share links'
  },
  {
    id: 5,
    title: 'Phase 5 · Polish & Performance',
    scope: 'Hover previews, skeletons, keyboard/a11y',
    backendAlignment: 'Shared polish goals',
    status: 'not-started',
    notes: 'Preview debounce, skeleton states, shortcuts'
  }
]

export const statusLabel = (status: RoadmapStatus): string => {
  switch (status) {
    case 'done':
      return '✅ Done'
    case 'in-progress':
      return '🚧 In progress'
    default:
      return '⏳ Not started'
  }
}
