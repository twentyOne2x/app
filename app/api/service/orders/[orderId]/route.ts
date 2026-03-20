import { proxyGetRequest } from '../../_utils'

type Params = {
  params: {
    orderId: string
  }
}

export async function GET(_request: Request, { params }: Params) {
  return proxyGetRequest(`/v1/channel-packs/orders/${encodeURIComponent(params.orderId)}`)
}
