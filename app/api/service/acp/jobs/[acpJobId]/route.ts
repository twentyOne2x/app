import { proxyGetRequest } from '../../../_utils'

type Params = Promise<{ acpJobId: string }>

export async function GET(_request: Request, context: { params: Params }) {
  const params = await context.params
  return proxyGetRequest(`/v1/channel-packs/acp/jobs/${encodeURIComponent(params.acpJobId)}`, _request)
}
