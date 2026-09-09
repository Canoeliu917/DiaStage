'use client'

import { useLayoutEffect } from 'react'
import { type LightingProject, validateLightingProject } from './model'
import { useLighting } from './store'

export function connectLightingPersistence(
  sceneId: string,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): () => void {
  const key = `lighting:v1:${sceneId}`
  let project: LightingProject = { version: 1, lights: [] }
  let persistenceBlocked = false
  let notice = ''
  let backend = storage
  try {
    backend ??= globalThis.localStorage
    const saved = backend.getItem(key)
    if (saved !== null) project = validateLightingProject(JSON.parse(saved))
  } catch {
    persistenceBlocked = true
    notice = '布光工程读取失败，原始数据已保留；导入有效工程后恢复保存。'
  }
  useLighting.setState({
    project,
    selectedLightId: project.lights[0]?.id ?? null,
    showHelpers: true,
    editTarget: 'position',
    draft: null,
    past: [],
    future: [],
    loadedSceneId: sceneId,
    persistenceBlocked,
    notice,
  })
  const unsubscribe = useLighting.subscribe((next, previous) => {
    if (
      next.loadedSceneId !== sceneId ||
      previous.loadedSceneId !== sceneId ||
      next.project === previous.project ||
      next.persistenceBlocked
    )
      return
    try {
      const validated = validateLightingProject(next.project)
      const destination = backend ?? globalThis.localStorage
      destination.setItem(key, JSON.stringify(validated))
    } catch {
      useLighting.getState().setNotice('浏览器未能保存布光工程，请导出工程文件备份。')
    }
  })
  return () => {
    unsubscribe()
    if (useLighting.getState().loadedSceneId === sceneId)
      useLighting.setState({ loadedSceneId: null, draft: null })
  }
}

export function LightingPersistence({ sceneId }: { sceneId: string }) {
  useLayoutEffect(() => connectLightingPersistence(sceneId), [sceneId])
  return null
}
