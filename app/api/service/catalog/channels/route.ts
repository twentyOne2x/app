import { proxyGetRequest } from '../../_utils'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const namespace = searchParams.get('namespace') ?? 'videos'
  return proxyGetRequest(`/v1/channel-packs/catalog/channels?namespace=${encodeURIComponent(namespace)}`)
}
