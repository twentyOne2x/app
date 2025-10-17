import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import type { ClipGenerationRequestPayload, ClipGenerationStatus } from '@/lib/types'
import { enqueueLocalClipJob } from './local-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const requestSchema = z
  .object({
    sourceUrl: z.string().url().optional(),
    parentTitle: z.string().optional(),
    clipLabel: z.string().optional(),
    channel: z.string().optional(),
    start: z.number().nonnegative(),
    end: z.number().positive(),
    contextMode: z.enum(['seconds', 'sentence']),
    padBefore: z.number().min(0),
    padAfter: z.number().min(0),
    derived: z.boolean().optional()
  })
  .refine((payload) => payload.end > payload.start, {
    message: 'Clip end must be greater than clip start'
  })

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL
const CLIP_SERVICE_TOKEN = process.env.CLIP_SERVICE_TOKEN

function sanitizeStatus(status: unknown): ClipGenerationStatus {
  const candidate = typeof status === 'string' ? status.toLowerCase() : ''
  if (candidate === 'queued' || candidate === 'processing' || candidate === 'ready' || candidate === 'error') {
    return candidate
  }
  return 'queued'
}

async function forwardClipPost(payload: ClipGenerationRequestPayload) {
  if (!CLIP_SERVICE_URL) {
    throw new Error('Clip service URL not configured')
  }
  const response = await fetch(`${CLIP_SERVICE_URL.replace(/\/$/, '')}/clips`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(CLIP_SERVICE_TOKEN ? { Authorization: `Bearer ${CLIP_SERVICE_TOKEN}` } : {})
    },
    body: JSON.stringify(payload)
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `Clip service responded with status ${response.status}`)
  }

  return JSON.parse(text) as { clipId?: string; id?: string; status?: string }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const raw = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('clips:request:invalid', {
      durationMs: Date.now() - startedAt,
      error: parsed.error.flatten()
    })
    return NextResponse.json(
      {
        error: 'Invalid clip payload',
        details: parsed.error.flatten()
      },
      { status: 400 }
    )
  }

  const payload = parsed.data
  console.log('clips:request', {
    start: payload.start,
    end: payload.end,
    duration: payload.end - payload.start,
    derived: payload.derived ?? false,
    contextMode: payload.contextMode,
    padBefore: payload.padBefore,
    padAfter: payload.padAfter
  })

  if (CLIP_SERVICE_URL) {
    try {
      const result = await forwardClipPost(payload)
      const clipId = result.clipId ?? result.id
      if (!clipId) {
        throw new Error('Clip service response missing clipId')
      }
      console.log('clips:response', {
        clipId,
        status: sanitizeStatus(result.status),
        durationMs: Date.now() - startedAt
      })
      return NextResponse.json({
        id: clipId,
        status: sanitizeStatus(result.status)
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reach clip service'
      console.error('clips:response:error', {
        message,
        durationMs: Date.now() - startedAt
      })
      return NextResponse.json({ error: message }, { status: 502 })
    }
  }

  const result = enqueueLocalClipJob(payload)
  console.log('clips:response:local', {
    clipId: result.id,
    status: result.status,
    durationMs: Date.now() - startedAt
  })
  return NextResponse.json(result)
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}
