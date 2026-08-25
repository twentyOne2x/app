import { NextResponse } from 'next/server'
import { z } from 'zod'
import { proxyJsonPayload } from '../service/_utils'

const publicIngestionRequest = z
  .object({
    platform: z.enum(['youtube', 'twitch', 'pumpfun', 'x', 'twitter']),
    target_kind: z.enum(['channel', 'item']),
    target: z.string().min(1).max(8000),
    platform_entity_id: z.string().min(1).max(255).nullable().optional(),
    max_items: z.number().int().min(1).max(200).optional(),
    clip_ready: z.boolean().optional(),
    transcription_mode: z.enum(['auto', 'openai', 'local_cpu']).optional(),
    language: z.string().regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/).optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.platform === 'x' || value.platform === 'twitter') &&
      !/^[0-9]{1,20}$/.test(value.platform_entity_id ?? '')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['platform_entity_id'],
        message: 'X/Twitter ingestion requires an exact numeric platform entity ID.'
      })
    }
  })

export async function POST(request: Request) {
  if (request.headers.get('idempotency-key') === null) {
    return NextResponse.json(
      { ok: false, error: 'idempotency key is required' },
      { status: 400 }
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json body' }, { status: 400 })
  }
  const parsed = publicIngestionRequest.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid public ingestion request' },
      { status: 400 }
    )
  }
  return proxyJsonPayload(request, '/v1/ingest', parsed.data)
}
