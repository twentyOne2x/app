import { NextResponse } from 'next/server'

import { proxyGetRequest } from '../../service/_utils'

type Params = { params: { id: string } }

const EXPORT_ID = /^tex_[0-9a-f]{40}$/

export async function GET(request: Request, { params }: Params) {
  if (!EXPORT_ID.test(params.id)) {
    return NextResponse.json({ ok: false, error: 'invalid tenant export id' }, { status: 404 })
  }
  return proxyGetRequest(`/v1/tenant-exports/${params.id}`, request)
}
