import { proxyGetRequest } from '../../../_utils'

type Params = {
  params: Promise<{
    orderId: string
  }>
}

export async function GET(_request: Request, { params }: Params) {
  const { orderId } = await params
  return proxyGetRequest(`/v1/channel-packs/orders/${encodeURIComponent(orderId)}/batches`, _request)
}
