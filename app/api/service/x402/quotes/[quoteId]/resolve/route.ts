import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  BoundedJsonBodyError,
  proxyJsonPayload,
  readBoundedJsonBody
} from '@/app/api/service/_utils'

const QUOTE_ID = /^[A-Za-z0-9._:-]{1,255}$/
const IDEMPOTENCY_KEY = /^[\x21-\x2b\x2d-\x7e]{1,255}$/
const MAX_RESOLUTION_BODY_BYTES = 4096
const Resolution = z
  .object({
    tool_name: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
    request_hash: z.string().regex(/^[0-9a-f]{64}$/),
    idempotency_key: z.string().regex(IDEMPOTENCY_KEY)
  })
  .strict()

type RouteParams = {
  params: Promise<{ quoteId: string }>
}

export async function POST(request: Request, { params }: RouteParams) {
  const { quoteId } = await params
  if (!QUOTE_ID.test(quoteId)) {
    return NextResponse.json({ ok: false, error: 'invalid quote id' }, { status: 400 })
  }
  let payload: unknown
  try {
    payload = await readBoundedJsonBody(request, MAX_RESOLUTION_BODY_BYTES)
  } catch (error) {
    if (!(error instanceof BoundedJsonBodyError)) throw error
    return NextResponse.json({ ok: false, error: 'invalid json body' }, { status: 400 })
  }
  const parsed = Resolution.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid payment quote request' }, { status: 400 })
  }
  if (request.headers.get('idempotency-key') !== parsed.data.idempotency_key) {
    return NextResponse.json(
      { ok: false, error: 'idempotency identity mismatch' },
      { status: 400 }
    )
  }
  return proxyJsonPayload(
    request,
    `/v1/commerce/quotes/${encodeURIComponent(quoteId)}/resolve-payment`,
    parsed.data
  )
}
