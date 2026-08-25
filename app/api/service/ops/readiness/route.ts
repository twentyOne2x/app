import { proxyGetRequest } from '../../_utils'

export async function GET(request: Request) {
  return proxyGetRequest('/v1/channel-packs/ops/readiness', request)
}
