'use client'

import { type SiteNode, useScene } from '@pascal-app/core'
import { useLayoutEffect } from 'react'
import { type CameraProject, validateCameraProject } from './model'
import { useCameraStudio } from './store'

export function connectCameraPersistence(
  sceneId: string,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
) {
  const key = `camera-studio:v1:${sceneId}`
  const empty: CameraProject = { version: 1, shots: [] }
  let legacyProject = empty
  let cacheBlocked = false
  let canonicalBlocked = false
  let syncing = false
  const siteNode = (state = useScene.getState()) =>
    state.rootNodeIds.map((id) => state.nodes[id]).find((node) => node?.type === 'site')
  try {
    const saved = storage.getItem(key)
    if (saved) legacyProject = validateCameraProject(JSON.parse(saved))
  } catch {
    cacheBlocked = true
  }
  let currentSiteId = siteNode()?.id
  let missingProject =
    siteNode()?.metadata.diastageCameraStudio === undefined ? legacyProject : empty

  function readProject(site: SiteNode | undefined) {
    if (site?.id !== currentSiteId) {
      currentSiteId = site?.id
      missingProject = site?.metadata.diastageCameraStudio === undefined ? legacyProject : empty
    }
    const raw = site?.metadata.diastageCameraStudio
    canonicalBlocked = false
    if (raw === undefined) return site ? missingProject : empty
    try {
      return validateCameraProject(raw)
    } catch {
      canonicalBlocked = true
      return empty
    }
  }

  function syncProject(project: CameraProject, reset = false) {
    syncing = true
    try {
      if (reset || JSON.stringify(project) !== JSON.stringify(useCameraStudio.getState().project))
        useCameraStudio.getState().setProject(project)
      if (canonicalBlocked)
        useCameraStudio
          .getState()
          .setNotice('项目机位资料无法读取，原始数据已保留。请恢复有效的项目备份。')
    } finally {
      syncing = false
    }
  }

  const initialSite = siteNode()
  syncProject(initialSite ? readProject(initialSite) : legacyProject, true)
  if (cacheBlocked && initialSite?.metadata.diastageCameraStudio === undefined)
    useCameraStudio.getState().setNotice('旧机位资料读取失败，原始缓存已保留。请导入有效备份。')

  const stopScene = useScene.subscribe((next, previous) => {
    if (syncing) return
    const site = siteNode(next),
      previousSite = siteNode(previous)
    if (
      site?.id === previousSite?.id &&
      site?.metadata.diastageCameraStudio === previousSite?.metadata.diastageCameraStudio
    )
      return
    syncProject(readProject(site))
  })
  const stopCamera = useCameraStudio.subscribe((next, previous) => {
    if (
      syncing ||
      next.project === previous.project ||
      JSON.stringify(next.project) === JSON.stringify(previous.project)
    )
      return
    const state = useScene.getState(),
      site = siteNode(state)
    if (canonicalBlocked || (site && state.readOnly)) {
      syncProject(readProject(site))
      if (state.readOnly) useCameraStudio.getState().setNotice('当前舞台只读，机位修改未保存。')
      return
    }
    if (
      site &&
      JSON.stringify(site.metadata.diastageCameraStudio) !== JSON.stringify(next.project)
    ) {
      syncing = true
      try {
        state.updateNode(site.id, {
          metadata: { ...site.metadata, diastageCameraStudio: next.project },
        })
      } finally {
        syncing = false
      }
    }
    if (cacheBlocked) return
    try {
      storage.setItem(key, JSON.stringify(next.project))
    } catch {
      useCameraStudio.getState().setNotice('机位缓存保存失败，项目仍沿用场景自动保存。')
    }
  })
  return () => {
    stopCamera()
    stopScene()
  }
}

export function CameraPersistence({ sceneId }: { sceneId: string }) {
  useLayoutEffect(
    () =>
      connectCameraPersistence(sceneId, {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
      }),
    [sceneId],
  )
  return null
}
