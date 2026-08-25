import { proxyGetPassthrough } from '../../../../_utils'

type Params = {
  params: Promise<{
    packId: string
  }>
}

export async function GET(_request: Request, { params }: Params) {
  const { packId } = await params
  return proxyGetPassthrough(
    `/v1/channel-packs/${encodeURIComponent(packId)}/exports/archive`,
    _request
  )
}
