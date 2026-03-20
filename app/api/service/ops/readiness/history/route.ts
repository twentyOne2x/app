import { proxyGetRequest } from '../../../_utils'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const limit = url.searchParams.get('limit')
  const suffix = limit ? `?limit=${encodeURIComponent(limit)}` : ''
  return proxyGetRequest(`/v1/channel-packs/ops/readiness/history${suffix}`)
}
