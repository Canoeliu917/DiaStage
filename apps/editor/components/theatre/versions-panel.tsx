'use client'

import { useScene } from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { archiveLegacyLighting } from '@/lib/legacy-lighting'
import {
  assertTheatreWritable,
  captureStageSnapshot,
  parseSnapshot,
  THEATRE_METADATA_KEY,
} from '@/lib/theatre/scene-adapter'
import { StageSnapshotSchema } from '@/lib/theatre/schema'
import { StageSceneDocumentSchema } from '@/lib/theatre/simulation'
import { readStageDocument } from '@/lib/theatre/simulation-store'
import { validateCameraProject } from '../camera-studio/model'
import { useCameraStudio } from '../camera-studio/store'
import { useSimulationSelection } from './simulation-panel'

const displaySchema = z.object({
  viewMode: z.enum(['2d', '3d', 'split']),
  theme: z.enum(['studio', 'night']),
  textures: z.boolean(),
  shading: z.enum(['solid', 'rendered']),
  showGrid: z.boolean(),
  showGuides: z.boolean(),
  showRoutes: z.boolean(),
  showCameras: z.boolean(),
})
const cameraSchema = z.object({
  project: z.unknown().transform((input, ctx) => {
    try {
      return validateCameraProject(input)
    } catch {
      ctx.addIssue({ code: 'custom', message: '版本机位资料无效' })
      return z.NEVER
    }
  }),
  selectedId: z.string().nullable(),
})
const versionSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1),
  createdAt: z.string(),
  stageGraph: StageSnapshotSchema,
  venue: StageSceneDocumentSchema.shape.venue,
  rehearsalSimulation: StageSceneDocumentSchema.shape.rehearsalSimulation,
  cameraState: cameraSchema,
  displayState: displaySchema,
})
const VERSIONS = 'diastageRehearsalVersions'
const VIEW = 'diastageRestoredView'
function siteNode() {
  const state = useScene.getState()
  const site = state.rootNodeIds.map((id) => state.nodes[id]).find((n) => n?.type === 'site')
  if (!site) throw new Error('请先打开剧目')
  return site
}
export function saveRehearsalVersion(name: string) {
  assertTheatreWritable()
  const doc = readStageDocument()
  if (!doc) throw new Error('请先建立舞台')
  const stage = parseSnapshot(captureStageSnapshot())
  const clean = archiveLegacyLighting(stage)
  for (const node of Object.values(clean.nodes)) {
    delete node.metadata.legacy
    delete node.metadata[VERSIONS]
    delete node.metadata[VIEW]
  }
  const viewer = useViewer.getState(),
    camera = useCameraStudio.getState(),
    site = siteNode()
  const version = versionSchema.parse({
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    stageGraph: clean,
    venue: doc.venue,
    rehearsalSimulation: doc.rehearsalSimulation,
    cameraState: { project: camera.project, selectedId: camera.selectedShotId },
    displayState: {
      viewMode: useEditor.getState().viewMode,
      theme: viewer.sceneTheme === 'night' ? 'night' : 'studio',
      textures: viewer.textures,
      shading: viewer.shading,
      showGrid: viewer.showGrid,
      showGuides: viewer.showGuides,
      showRoutes: useSimulationSelection.getState().showRoutes,
      showCameras: camera.showStageCameras,
    },
  })
  const versions = z.array(versionSchema).parse(site.metadata[VERSIONS] ?? [])
  useScene
    .getState()
    .updateNode(site.id, { metadata: { ...site.metadata, [VERSIONS]: [...versions, version] } })
}
export function restoreRehearsalVersion(id: string) {
  assertTheatreWritable()
  const site = siteNode(),
    doc = readStageDocument()
  const version = z
    .array(versionSchema)
    .parse(site.metadata[VERSIONS] ?? [])
    .find((v) => v.id === id)
  if (!doc || !version) throw new Error('排演版本不存在')
  const snapshot = parseSnapshot(version.stageGraph)
  const root = snapshot.rootNodeIds.map((id) => snapshot.nodes[id]).find((n) => n?.type === 'site')
  if (!root) throw new Error('版本缺少舞台')
  root.metadata = {
    ...root.metadata,
    ...site.metadata,
    [THEATRE_METADATA_KEY]: StageSceneDocumentSchema.parse({
      ...doc,
      venue: version.venue,
      rehearsalSimulation: version.rehearsalSimulation,
    }),
    [VIEW]: { camera: version.cameraState, display: version.displayState },
    diastageCameraStudio: version.cameraState.project,
  }
  // Store the previous view with the undo frame, so one scene undo restores all three stores.
  const viewer = useViewer.getState(),
    camera = useCameraStudio.getState()
  const previousView = {
    camera: { project: camera.project, selectedId: camera.selectedShotId },
    display: {
      viewMode: useEditor.getState().viewMode,
      theme: viewer.sceneTheme === 'night' ? 'night' : 'studio',
      textures: viewer.textures,
      shading: viewer.shading,
      showGrid: viewer.showGrid,
      showGuides: viewer.showGuides,
      showRoutes: useSimulationSelection.getState().showRoutes,
      showCameras: camera.showStageCameras,
    },
  }
  const history = useScene.temporal.getState()
  history.pause()
  try {
    useScene
      .getState()
      .updateNode(site.id, { metadata: { ...site.metadata, [VIEW]: previousView } })
  } finally {
    history.resume()
  }
  useScene.getState().setScene(snapshot.nodes, snapshot.rootNodeIds, {
    materials: snapshot.materials,
    collections: snapshot.collections,
    installedPlugins: snapshot.installedPlugins,
    hasExplicitPluginInstallState: useScene.getState().hasExplicitPluginInstallState,
  })
}
/** Restoring or undoing a version changes this one metadata entry. Normal camera edits do not. */
export function connectVersionViewSync() {
  return useScene.subscribe((next, previous) => {
    const get = (state: typeof next) =>
      state.rootNodeIds.map((id) => state.nodes[id]).find((n) => n?.type === 'site')?.metadata[VIEW]
    const value = get(next)
    if (!value || value === get(previous)) return
    const result = z.object({ camera: cameraSchema, display: displaySchema }).safeParse(value)
    if (!result.success) return
    const { camera, display } = result.data
    useCameraStudio.getState().setProject(camera.project)
    if (camera.selectedId) useCameraStudio.getState().selectShot(camera.selectedId)
    useCameraStudio.getState().setShowStageCameras(display.showCameras)
    useSimulationSelection.setState({ showRoutes: display.showRoutes })
    useEditor.getState().setViewMode(display.viewMode)
    const viewer = useViewer.getState()
    viewer.setSceneTheme(display.theme)
    viewer.setTextures(display.textures)
    viewer.setShading(display.shading)
    viewer.setShowGrid(display.showGrid)
    viewer.setShowGuides(display.showGuides)
  })
}
export function VersionViewSync() {
  useEffect(connectVersionViewSync, [])
  return null
}
export function VersionsPanel() {
  const nodes = useScene((s) => s.nodes),
    roots = useScene((s) => s.rootNodeIds),
    readOnly = useScene((s) => s.readOnly)
  const [name, setName] = useState(''),
    [notice, setNotice] = useState('')
  const parsed = z
    .array(versionSchema)
    .safeParse(
      roots.map((id) => nodes[id]).find((n) => n?.type === 'site')?.metadata[VERSIONS] ?? [],
    )
  const run = (fn: () => void) => {
    try {
      fn()
      setNotice('已完成')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '未完成')
    }
  }
  return (
    <section className="theatre-panel" aria-label="排演版本">
      <h2>排演版本</h2>
      <p>保存舞台布景、人物路线、摄影机与显示状态。恢复版本后可撤销。</p>
      <fieldset disabled={readOnly}>
        <label>
          版本名称
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => run(() => saveRehearsalVersion(name))}
        >
          保存当前版本
        </button>
        {parsed.success ? (
          parsed.data.map((v) => (
            <div key={v.id}>
              <strong>{v.name}</strong>
              <p>{new Date(v.createdAt).toLocaleString('zh-CN')}</p>
              <button type="button" onClick={() => run(() => restoreRehearsalVersion(v.id))}>
                恢复此版本
              </button>
            </div>
          ))
        ) : (
          <p role="alert">版本资料无法读取，原始数据已保留。</p>
        )}
      </fieldset>
      <p role="status">{notice}</p>
    </section>
  )
}
