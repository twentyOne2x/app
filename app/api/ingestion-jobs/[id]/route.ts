import { NextResponse } from 'next/server'

import { proxyGetRequest } from '../../service/_utils'

type Params = { params: { id: string } }

const INGESTION_JOB_ID = /^job_[0-9a-f]{40}$/

export async function GET(request: Request, { params }: Params) {
  if (!INGESTION_JOB_ID.test(params.id)) {
    return NextResponse.json({ ok: false, error: 'invalid ingestion job id' }, { status: 404 })
  }
  return proxyGetRequest(`/v1/ingestion-jobs/${params.id}`, request)
}
