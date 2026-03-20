import { proxyGetRequest } from '../../_utils'

type RouteParams = {
  params: Promise<{ quoteId: string }>
}

export async function GET(_: Request, { params }: RouteParams) {
  const { quoteId } = await params
  return proxyGetRequest(`/v1/channel-packs/quotes/${encodeURIComponent(quoteId)}`)
}
