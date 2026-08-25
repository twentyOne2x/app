import { proxyGetRequest } from '../../../_utils'

type Params = {
  params: {
    packId: string
  }
}

export async function GET(_request: Request, { params }: Params) {
  return proxyGetRequest(`/v1/channel-packs/${encodeURIComponent(params.packId)}/manifest`, _request)
}
