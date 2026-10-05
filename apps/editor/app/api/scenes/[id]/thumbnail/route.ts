import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { guardSceneApiRequest, sceneApiJson, sceneApiPreflight } from '@/lib/scene-api-security'
import { getSceneStore } from '@/lib/scene-store-server'

const thumbnailSchema = z.object({
  thumbnailUrl: z
    .string()
    .max(2 * 1024 * 1024)
    .regex(
      /^data:image\/(?:png|jpeg|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
    ),
  expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
})

function hasImageHeader(url: string) {
  const [prefix, encoded] = url.split(',')
  const data = Buffer.from(encoded!, 'base64')
  if (prefix === 'data:image/png;base64')
    return data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (prefix === 'data:image/jpeg;base64')
    return data[0] === 255 && data[1] === 216 && data[2] === 255
  return data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
}

export function OPTIONS(request: NextRequest) {
  return sceneApiPreflight(request)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardSceneApiRequest(request)
  if (denied) return denied
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return sceneApiJson(request, { error: 'invalid_request' }, { status: 400 })
  }
  const parsed = thumbnailSchema.safeParse(body)
  if (!parsed.success || !hasImageHeader(parsed.data.thumbnailUrl))
    return sceneApiJson(request, { error: 'invalid_thumbnail' }, { status: 400 })

  try {
    const store = await getSceneStore()
    if (!store.updateThumbnail)
      return sceneApiJson(request, { error: 'thumbnail_storage_unavailable' }, { status: 503 })
    const { id } = await params
    const meta = await store.updateThumbnail(id, parsed.data.thumbnailUrl, {
      expectedVersion: parsed.data.expectedVersion,
    })
    return sceneApiJson(request, { version: meta.version, updatedAt: meta.updatedAt })
  } catch (error) {
    const code = (error as { code?: string })?.code
    const status = code === 'version_conflict' ? 409 : code === 'not_found' ? 404 : 500
    return sceneApiJson(request, { error: code ?? 'thumbnail_save_failed' }, { status })
  }
}
