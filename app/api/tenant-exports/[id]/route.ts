import { NextResponse } from 'next/server'

import { proxyGetRequest } from '../../service/_utils'

type Params = { params: Promise<{ id: string }> }

const EXPORT_ID = /^tex_[0-9a-f]{40}$/

export async function GET(request: Request, { params }: Params) {
  const { id } = await params
  if (!EXPORT_ID.test(id)) {
    return NextResponse.json({ ok: false, error: 'invalid tenant export id' }, { status: 404 })
  }
  return proxyGetRequest(`/v1/tenant-exports/${id}`, request)
}
