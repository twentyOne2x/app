import { NextResponse } from 'next/server'

import { proxyGetPassthrough } from '../../../../_utils'

type Params = {
  params: {
    packId: string
    name: string
  }
}

const ALLOWED_EXPORTS = new Set(['archive', 'links', 'manifest', 'transcripts', 'videos'])

export async function GET(_request: Request, { params }: Params) {
  if (!ALLOWED_EXPORTS.has(params.name)) {
    return NextResponse.json({ ok: false, error: 'unsupported export' }, { status: 404 })
  }

  return proxyGetPassthrough(
    `/v1/channel-packs/${encodeURIComponent(params.packId)}/exports/${encodeURIComponent(params.name)}`,
    _request
  )
}
