import type { SceneOperations } from '@pascal-app/mcp/operations'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { countGraphNodes, isEmptyGraphOverwrite } from '@/lib/empty-graph-guard'
import { apiGraphSchema } from '@/lib/graph-schema'
import { sceneApiJson, sceneApiPreflight, withSceneApiHeaders } from '@/lib/scene-api-security'
import { getPrivateSceneAccess } from '@/lib/scene-store-server'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

const putSceneSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  graph: apiGraphSchema,
  thumbnailUrl: z.string().url().nullable().optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
  /**
   * Overwriting a populated scene with a 0-node graph is rejected (409
   * `empty_graph_rejected`) unless this is set: an empty PUT is a hydration
   * race or a bug far more often than an intentional full deletion, and the
   * wipe is silent while the deletion is recoverable from scene_revisions.
   */
  force: z.boolean().optional(),
})

const patchSceneSchema = z.object({
  name: z.string().min(1).max(200),
  expectedVersion: z.number().int().nonnegative().optional(),
})

export function OPTIONS(request: NextRequest) {
  return sceneApiPreflight(request)
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const access = await getPrivateSceneAccess(request)
  if (access instanceof Response) return access

  const { id } = await params
  const { operations } = access
  try {
    const scene = await operations.loadStoredScene(id)
    if (!scene) {
      return sceneApiJson(request, { error: 'not_found' }, { status: 404 })
    }
    return sceneApiJson(request, scene, {
      headers: { ETag: `"${scene.version}"` },
    })
  } catch (error) {
    return handleStoreError(request, error)
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const access = await getPrivateSceneAccess(request)
  if (access instanceof Response) return access

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return sceneApiJson(
      request,
      { error: 'invalid_request', details: 'body must be valid JSON' },
      { status: 400 },
    )
  }

  const parsed = putSceneSchema.safeParse(body)
  if (!parsed.success) {
    return sceneApiJson(
      request,
      { error: 'invalid_request', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const ifMatch = parseIfMatch(request.headers.get('If-Match'))
  const expectedVersion = ifMatch ?? parsed.data.expectedVersion

  const { operations } = access
  try {
    const existing = await operations.loadStoredScene(id)
    if (!existing) {
      return sceneApiJson(request, { error: 'not_found' }, { status: 404 })
    }
    if (
      !parsed.data.force &&
      isEmptyGraphOverwrite(countGraphNodes(parsed.data.graph), existing.nodeCount)
    ) {
      return sceneApiJson(
        request,
        {
          error: 'empty_graph_rejected',
          details: `Refusing to overwrite ${existing.nodeCount} nodes with an empty graph. Pass "force": true to overwrite intentionally.`,
          currentVersion: existing.version,
          currentNodeCount: existing.nodeCount,
        },
        { status: 409 },
      )
    }
    const meta = await operations.saveScene({
      id,
      name: parsed.data.name ?? existing.name,
      projectId: existing.projectId,
      ownerId: existing.ownerId,
      graph: parsed.data.graph as never,
      thumbnailUrl: parsed.data.thumbnailUrl,
      expectedVersion: expectedVersion ?? existing.version,
    })
    return sceneApiJson(request, meta, {
      headers: { ETag: `"${meta.version}"` },
    })
  } catch (error) {
    return handleStoreError(request, error, operations, id)
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const access = await getPrivateSceneAccess(request)
  if (access instanceof Response) return access

  const { id } = await params
  const ifMatch = parseIfMatch(request.headers.get('If-Match'))

  const { operations } = access
  try {
    const removed = await operations.deleteStoredScene(id, { expectedVersion: ifMatch })
    if (!removed) {
      return sceneApiJson(request, { error: 'not_found' }, { status: 404 })
    }
    return withSceneApiHeaders(request, new NextResponse(null, { status: 204 }))
  } catch (error) {
    return handleStoreError(request, error, operations, id)
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const access = await getPrivateSceneAccess(request)
  if (access instanceof Response) return access

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return sceneApiJson(
      request,
      { error: 'invalid_request', details: 'body must be valid JSON' },
      { status: 400 },
    )
  }

  const parsed = patchSceneSchema.safeParse(body)
  if (!parsed.success) {
    return sceneApiJson(
      request,
      { error: 'invalid_request', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const ifMatch = parseIfMatch(request.headers.get('If-Match'))
  const expectedVersion = ifMatch ?? parsed.data.expectedVersion

  const { operations } = access
  try {
    const meta = await operations.renameStoredScene(id, parsed.data.name, { expectedVersion })
    return sceneApiJson(request, meta, {
      headers: { ETag: `"${meta.version}"` },
    })
  } catch (error) {
    return handleStoreError(request, error, operations, id)
  }
}

/**
 * Parses an `If-Match` header value per RFC 7232. Accepts `"<version>"` or
 * weak `W/"<version>"` forms. Returns `undefined` when the header is absent,
 * the wildcard `*`, or unparseable as a non-negative integer.
 */
function parseIfMatch(raw: string | null): number | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim()
  if (trimmed === '*') return undefined
  const match = trimmed.match(/^(?:W\/)?"([^"]+)"$/)
  const inner = match ? match[1] : trimmed
  if (!inner) return undefined
  const n = Number(inner)
  if (!(Number.isFinite(n) && Number.isInteger(n)) || n < 0) return undefined
  return n
}

async function handleStoreError(
  request: NextRequest,
  error: unknown,
  operations?: SceneOperations,
  id?: string,
): Promise<NextResponse> {
  const code = (error as { code?: string })?.code
  if (code === 'version_conflict') {
    const current = operations && id ? await operations.loadStoredScene(id) : null
    return sceneApiJson(
      request,
      { error: 'version_conflict', ...(current && { currentVersion: current.version }) },
      { status: 409 },
    )
  }
  if (code === 'not_found') {
    return sceneApiJson(request, { error: 'not_found' }, { status: 404 })
  }
  if (code === 'too_large') {
    return sceneApiJson(request, { error: 'too_large' }, { status: 413 })
  }
  if (code === 'invalid') {
    return sceneApiJson(request, { error: 'invalid' }, { status: 400 })
  }
  const message = error instanceof Error ? error.message : 'unexpected_error'
  return sceneApiJson(request, { error: 'internal_error', message }, { status: 500 })
}
