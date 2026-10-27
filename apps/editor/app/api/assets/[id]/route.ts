import {
  requireSceneSession,
  sceneApiJson,
  sceneApiPreflight,
  withSceneApiHeaders,
} from '@/lib/scene-api-security'
import {
  assertSceneAssetId,
  getSceneAssetStore,
  readSceneAssetBody,
  SceneAssetError,
  sceneAssetContentType,
} from '@/lib/scene-assets-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const OPTIONS = sceneApiPreflight
type Params = { params: Promise<{ id: string }> }

function failure(request: Request, error: unknown) {
  return sceneApiJson(
    request,
    { error: error instanceof SceneAssetError ? error.code : 'asset_internal_error' },
    { status: error instanceof SceneAssetError ? error.status : 500 },
  )
}

async function read(request: Request, { params }: Params, head = false): Promise<Response> {
  let response: Response
  try {
    const session = await requireSceneSession(request)
    if (session instanceof Response) response = session
    else {
      if (request.headers.get('x-diastage-asset-owner') !== session.user.id)
        throw new SceneAssetError('asset_account_changed', 409)
      const { id } = await params
      assertSceneAssetId(id)
      const store = getSceneAssetStore()
      let body: Uint8Array<ArrayBuffer> | null = null
      const asset = head
        ? await store.head(session.user.id, id)
        : await store.get(session.user.id, id).then((stored) => {
            if (stored) body = new Uint8Array(stored.body)
            return stored
          })
      if (!asset) throw new SceneAssetError('asset_not_found', 404)
      response = withSceneApiHeaders(
        request,
        new Response(body, {
          headers: {
            'content-type': asset.contentType,
            'content-length': String(asset.bytes),
            'x-asset-sha256': asset.sha256,
          },
        }),
      )
    }
  } catch (error) {
    response = failure(request, error)
  }
  return head
    ? new Response(null, { status: response.status, headers: response.headers })
    : response
}

export function GET(request: Request, context: Params) {
  return read(request, context)
}

export function HEAD(request: Request, context: Params) {
  return read(request, context, true)
}

export async function PUT(request: Request, { params }: Params): Promise<Response> {
  try {
    const session = await requireSceneSession(request)
    if (session instanceof Response) return session
    if (request.headers.get('x-diastage-asset-owner') !== session.user.id)
      throw new SceneAssetError('asset_account_changed', 409)
    const { id } = await params
    assertSceneAssetId(id)
    const type = sceneAssetContentType(request.headers.get('content-type'))
    const body = await readSceneAssetBody(request)
    const result = await getSceneAssetStore().put(session.user.id, id, type, body)
    return sceneApiJson(request, result.metadata, { status: result.created ? 201 : 200 })
  } catch (error) {
    return failure(request, error)
  }
}
