import { proxyGetRequest } from '../../_utils'

export async function GET() {
  return proxyGetRequest('/v1/channel-packs/acp/offerings')
}
