import { proxyGetPassthrough } from '../../../../_utils'

type Params = {
  params: {
    packId: string
  }
}

export async function GET(_request: Request, { params }: Params) {
  return proxyGetPassthrough(
    `/v1/channel-packs/${encodeURIComponent(params.packId)}/exports/archive`
  )
}
