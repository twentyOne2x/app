import { proxyJsonRequest } from '../_utils'

export async function POST(request: Request) {
  return proxyJsonRequest(request, '/v1/channel-packs/quotes')
}
