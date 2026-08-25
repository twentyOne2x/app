import { proxyJsonRequest } from '../../service/_utils'

export async function POST(request: Request) {
  return proxyJsonRequest(request, '/index/youtube')
}
