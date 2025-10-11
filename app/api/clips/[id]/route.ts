import { NextResponse, type NextRequest } from 'next/server'
import type { ClipGenerationRecord } from '@/lib/types'
import { getLocalClipJob } from '../local-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL
const CLIP_SERVICE_TOKEN = process.env.CLIP_SERVICE_TOKEN

function rewriteProxyUrl(raw: unknown, clipId: string) {
  if (!raw || typeof raw !== 'string' || !clipId) return raw
  if (!raw.startsWith('/')) return raw
  const hasDownload = raw.includes('download=1')
  const suffix = hasDownload ? '?download=1' : ''
  return `/api/clips/${clipId}/stream${suffix}`
}

function remapClipResponse(record: ClipGenerationRecord) {
  const clipId = record.clipId ?? record.id ?? ''
  return {
    ...record,
    clipId,
    streamUrl: rewriteProxyUrl(record.streamUrl, clipId),
    downloadUrl: rewriteProxyUrl(record.downloadUrl, clipId)
  }
}

async function forwardClipStatus(id: string): Promise<ClipGenerationRecord> {
  if (!CLIP_SERVICE_URL) {
    throw new Error('Clip service URL not configured')
  }
  const response = await fetch(`${CLIP_SERVICE_URL.replace(/\/$/, '')}/clips/${id}`, {
    method: 'GET',
    headers: {
      ...(CLIP_SERVICE_TOKEN ? { Authorization: `Bearer ${CLIP_SERVICE_TOKEN}` } : {})
    },
    cache: 'no-store'
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `Clip service responded with status ${response.status}`)
  }

  return JSON.parse(text) as ClipGenerationRecord
}

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  const id = context.params.id

  if (!id) {
    return NextResponse.json({ error: 'Missing clip id' }, { status: 400 })
  }

  if (CLIP_SERVICE_URL) {
    try {
      const status = await forwardClipStatus(id)
      return NextResponse.json(remapClipResponse(status))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reach clip service'
      return NextResponse.json({ error: message }, { status: 502 })
    }
  }

  const job = getLocalClipJob(id)
  if (!job) {
    return NextResponse.json({ error: 'Clip not found' }, { status: 404 })
  }
  return NextResponse.json(job)
}
