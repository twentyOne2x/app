import { NextResponse } from 'next/server'

import { proxyGetPassthrough } from '../../../../service/_utils'

type Params = { params: { id: string; name: string } }

const EXPORT_ID = /^tex_[0-9a-f]{40}$/
const ARTIFACTS = new Set(['database', 'manifest'])

export async function GET(request: Request, { params }: Params) {
  if (!EXPORT_ID.test(params.id) || !ARTIFACTS.has(params.name)) {
    return NextResponse.json({ ok: false, error: 'tenant export artifact not found' }, { status: 404 })
  }
  return proxyGetPassthrough(
    `/v1/tenant-exports/${params.id}/artifacts/${params.name}`,
    request
  )
}
