import { NextResponse } from 'next/server'
import { z } from 'zod'

import { proxyJsonPayload } from '../service/_utils'

const REQUEST = z
  .object({
    idempotency_key: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[^\u0000-\u001f\u007f]+$/)
  })
  .strict()

export async function POST(request: Request) {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json body' }, { status: 400 })
  }
  const parsed = REQUEST.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid tenant export request' },
      { status: 400 }
    )
  }
  return proxyJsonPayload(request, '/v1/tenant-exports', parsed.data)
}
