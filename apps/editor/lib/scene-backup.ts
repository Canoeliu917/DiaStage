import { type AnyNode, type AnyNodeId, validateBuildJson } from '@pascal-app/core'
import type { SceneGraph } from '@pascal-app/editor'
import { getLocalAccountOwner } from './auth/local-account'
import { apiGraphSchema } from './graph-schema'
import { uploadSceneAssets } from './scene-assets-client'
import { parseSnapshot, THEATRE_METADATA_KEY } from './theatre/scene-adapter'
import { readStageDocument } from './theatre/simulation-store'

export function parseSceneBackup(text: string) {
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    throw new Error('文件无法解析为 JSON，请选择导出的场景备份。')
  }
  const result = validateBuildJson(input)
  if (!result.ok || !result.parsed)
    throw new Error(`场景备份无法导入：${result.errors.map((issue) => issue.message).join('；')}`)
  const graph = apiGraphSchema.safeParse({ ...(input as object), ...result.parsed })
  if (!graph.success) throw new Error('场景备份包含无效节点、材质或资源地址，未创建任何剧目。')
  try {
    parseSnapshot(graph.data as Parameters<typeof parseSnapshot>[0])
  } catch {
    throw new Error('场景备份的层级、分组或材质引用无效，未创建任何剧目。')
  }
  return {
    graph: graph.data as SceneGraph,
    warnings: result.warnings.map((issue) => issue.message),
  }
}

/** A new scene only: recovery never overwrites the source or the currently open scene. */
export async function createSceneCopy(graph: SceneGraph, name: string) {
  const ownerId = getLocalAccountOwner()
  if (!ownerId) throw new Error('账号尚未准备好，请重新打开场景后恢复副本。')
  name = name.trim().slice(0, 200) || '恢复的剧目'
  const copy = structuredClone(graph)
  const nodes = copy.nodes as Record<string, AnyNode>
  try {
    if (readStageDocument(nodes, copy.rootNodeIds as AnyNodeId[])) {
      const site = copy.rootNodeIds
        .map((id) => nodes[id])
        .find((node) => node?.type === 'site')!
      const source = site.metadata[THEATRE_METADATA_KEY] as { production: Record<string, unknown> }
      site.metadata[THEATRE_METADATA_KEY] = {
        ...source,
        production: { ...source.production, name },
      }
    }
  } catch {
    // Preserve unreadable legacy metadata in recovery copies, as normal saves do.
  }
  await uploadSceneAssets(copy)
  const response = await fetch('/api/scenes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-diastage-asset-owner': ownerId },
    body: JSON.stringify({ name, graph: copy }),
    signal: AbortSignal.timeout(20_000),
  })
  if (response.status === 409) throw new Error('账号已切换，副本未保存；请重新登录原账号后重试。')
  if (!response.ok)
    throw new Error(`创建剧目副本失败（${response.status}），原场景和本机记录仍保留。`)
  const saved = (await response.json()) as { id?: string }
  if (typeof saved.id !== 'string' || !saved.id) throw new Error('副本响应不完整，本机记录仍保留。')
  return `/scene/${encodeURIComponent(saved.id)}`
}
