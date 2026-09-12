'use client'

import { useScene } from '@pascal-app/core'
import { rotatePoint } from '@pascal-app/core/remount'
import {
  type SceneContextObject,
  worldToStagePosition,
  worldToStageRotation,
} from '@pascal-app/core/stage'
import { useEditor } from '@pascal-app/editor'
import { useViewer, ViewerErrorBoundary } from '@pascal-app/viewer'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { archiveLegacyLighting } from '@/lib/legacy-lighting'
import { objectSnapshot, prepareVersionRemount } from '@/lib/remount-scene'
import { stageKind } from '@/lib/stage/context'
import {
  VersionCameraSchema as cameraSchema,
  VersionDisplaySchema as displaySchema,
  openVersionPreview,
  type RehearsalVersion,
  rehearsalVersionHashes,
  useVersionPreview,
  REHEARSAL_VERSIONS_KEY as VERSIONS,
  RehearsalVersionSchema as versionSchema,
} from '@/lib/theatre/rehearsal-versions'
import {
  assertTheatreWritable,
  captureStageSnapshot,
  parseSnapshot,
  THEATRE_METADATA_KEY,
} from '@/lib/theatre/scene-adapter'
import { StageSceneDocumentSchema } from '@/lib/theatre/simulation'
import { readStageDocument } from '@/lib/theatre/simulation-store'
import { useCameraStudio } from '../camera-studio/store'
import { useSimulationSelection } from './simulation-panel'

const VIEW = 'diastageRestoredView'
function siteNode() {
  const state = useScene.getState()
  const site = state.rootNodeIds.map((id) => state.nodes[id]).find((n) => n?.type === 'site')
  if (!site) throw new Error('请先打开剧目')
  return site
}
export function saveRehearsalVersion(name: string, note = '') {
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
    note,
    createdAt: new Date().toISOString(),
    stageGraph: clean,
    venue: doc.venue,
    rehearsalSimulation: doc.rehearsalSimulation,
    ...rehearsalVersionHashes({
      stageGraph: clean,
      venue: doc.venue,
      rehearsalSimulation: doc.rehearsalSimulation,
    }),
    ...(typeof site.metadata.diastageRehearsalDecision === 'object' &&
    site.metadata.diastageRehearsalDecision !== null &&
    'interactionId' in site.metadata.diastageRehearsalDecision &&
    typeof site.metadata.diastageRehearsalDecision.interactionId === 'string'
      ? { interactionId: site.metadata.diastageRehearsalDecision.interactionId }
      : {}),
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
  const versions = z.array(versionSchema).parse(site.metadata[VERSIONS] ?? [])
  const restored = versionSchema.parse({
    ...version,
    id: crypto.randomUUID(),
    name: `恢复 · ${version.name}`.slice(0, 120),
    note: `从「${version.name}」恢复`,
    createdAt: new Date().toISOString(),
    restoredFrom: version.id,
    sourceVersion: version.id,
  })
  const snapshot = parseSnapshot(version.stageGraph)
  const root = snapshot.rootNodeIds.map((id) => snapshot.nodes[id]).find((n) => n?.type === 'site')
  if (!root) throw new Error('版本缺少舞台')
  root.metadata = {
    ...root.metadata,
    ...site.metadata,
    [VERSIONS]: [...versions, restored],
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
export function VersionsPanel({ sceneId }: { sceneId: string }) {
  const nodes = useScene((s) => s.nodes),
    roots = useScene((s) => s.rootNodeIds),
    readOnly = useScene((s) => s.readOnly)
  const [name, setName] = useState(''),
    [notice, setNotice] = useState('')
  const [note, setNote] = useState('')
  const selectedId = useVersionPreview((state) => state.selectedId)
  const previewRoot = useVersionPreview((state) => state.rootKey)
  const parsed = z
    .array(versionSchema)
    .safeParse(
      roots.map((id) => nodes[id]).find((n) => n?.type === 'site')?.metadata[VERSIONS] ?? [],
    )
  const preview =
    parsed.success && previewRoot === JSON.stringify(roots)
      ? parsed.data.find((version) => version.id === selectedId)
      : null
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
      <p>版本保留场地、布景与排演。可以只读查看、明确恢复，或带入新场地复台。</p>
      <fieldset disabled={readOnly}>
        <label>
          版本名称
          <input maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          简短说明（选填）
          <input maxLength={240} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => run(() => saveRehearsalVersion(name, note))}
        >
          保存当前版本
        </button>
      </fieldset>
      {parsed.success ? (
        parsed.data.map((v) => (
          <div key={v.id}>
            <strong>{v.name}</strong>
            <p>{new Date(v.createdAt).toLocaleString('zh-CN')}</p>
            {v.note && <p>{v.note}</p>}
            <button
              type="button"
              onClick={() =>
                run(() => {
                  openVersionPreview(v.id)
                })
              }
            >
              查看此版本
            </button>
          </div>
        ))
      ) : (
        <p role="alert">版本资料无法读取，原始数据已保留。</p>
      )}
      {preview && (
        <section aria-label="版本预览">
          <h3>{preview.name}</h3>
          <ViewerErrorBoundary
            scope="version-preview"
            resetKey={preview.id}
            fallback={<p role="alert">版本预览无法显示，当前舞台未改变。请选择其他版本。</p>}
          >
            <VersionDrawing version={preview} />
          </ViewerErrorBoundary>
          <p>
            正在查看历史版本，当前舞台未改变。人物 {preview.rehearsalSimulation.performers.length}{' '}
            位 · 路线 {preview.rehearsalSimulation.paths.length} 条。
          </p>
          <details>
            <summary>版本来源</summary>
            <p>场景 {preview.sceneVersion ?? rehearsalVersionHashes(preview).sceneVersion}</p>
            <p>场地 {preview.venueVersion ?? rehearsalVersionHashes(preview).venueVersion}</p>
            <p>
              排演 {preview.rehearsalVersion ?? rehearsalVersionHashes(preview).rehearsalVersion}
            </p>
            <p>{new Date(preview.createdAt).toLocaleString('zh-CN')}</p>
            {preview.sourceVersion && <p>来源版本 {preview.sourceVersion}</p>}
          </details>
          <div className="th-buttons">
            <button
              type="button"
              disabled={readOnly}
              onClick={() =>
                run(() => {
                  prepareVersionRemount(sceneId, preview.id)
                  useEditor.getState().setActiveSidebarPanel('remount')
                })
              }
            >
              以此版本复台
            </button>
            <button
              type="button"
              disabled={readOnly}
              onClick={() =>
                run(() => {
                  restoreRehearsalVersion(preview.id)
                  useVersionPreview.setState({ selectedId: null })
                })
              }
            >
              确认恢复此版本
            </button>
            <button type="button" onClick={() => useVersionPreview.setState({ selectedId: null })}>
              关闭查看
            </button>
          </div>
        </section>
      )}
      <p role="status">{notice}</p>
    </section>
  )
}

function VersionDrawing({ version }: { version: RehearsalVersion }) {
  const snapshot = parseSnapshot(version.stageGraph)
  const frame = { origin: version.venue.origin, depthMeters: version.venue.depth }
  const objects: SceneContextObject[] = Object.values(snapshot.nodes).flatMap((node) => {
    const kind = stageKind(node)
    if (
      !kind ||
      node.visible === false ||
      (node.type !== 'item' && node.type !== 'block' && node.type !== 'stair')
    )
      return []
    const pose = objectSnapshot(node, snapshot.nodes)
    if (node.type === 'stair') {
      const offset = rotatePoint([pose.boundsCenter[0], 0, pose.boundsCenter[2]], pose.rotation)
      pose.position = [
        pose.position[0] + offset[0],
        pose.position[1] + offset[1],
        pose.position[2] + offset[2],
      ]
    }
    return [
      {
        id: node.id,
        name: node.name || '布景',
        kind,
        dimensionsMeters: {
          width: pose.dimensions[0],
          height: pose.dimensions[1],
          depth: pose.dimensions[2],
        },
        transform: {
          position: worldToStagePosition(pose.position, frame),
          rotationDegrees: worldToStageRotation(pose.rotation),
        },
      },
    ]
  })
  for (const performer of version.rehearsalSimulation.performers)
    objects.push({
      id: performer.id,
      name: performer.name,
      kind: 'performer-marker',
      dimensionsMeters: { width: 0.4, height: 1.7, depth: 0.4 },
      transform: {
        position: worldToStagePosition(performer.position, frame),
        rotationDegrees: worldToStageRotation([0, performer.facing, 0]),
      },
    })
  const { width, depth, origin } = version.venue
  return (
    <figure>
      <svg
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label="历史版本：场地、布景、人物与路线，台口在下方"
        viewBox={`${-width / 2 - 0.5} -0.5 ${width + 1} ${depth + 1.2}`}
      >
        <rect
          x={-width / 2}
          y={0}
          width={width}
          height={depth}
          fill="#eee"
          stroke="#888"
          strokeWidth={0.04}
        />
        {objects.map((object) => (
          <rect
            key={object.id}
            x={-object.transform.position.x - object.dimensionsMeters.width / 2}
            y={depth - object.transform.position.z - object.dimensionsMeters.depth / 2}
            width={object.dimensionsMeters.width}
            height={object.dimensionsMeters.depth}
            transform={`rotate(${object.transform.rotationDegrees.y},${-object.transform.position.x},${depth - object.transform.position.z})`}
            fill={object.kind === 'performer-marker' ? '#303030' : '#999'}
            fillOpacity={0.6}
            stroke="#444"
            strokeWidth={0.03}
          >
            <title>{object.name}</title>
          </rect>
        ))}
        {version.rehearsalSimulation.paths
          .filter((path) => path.visible)
          .map((path) => (
            <polyline
              key={path.id}
              points={path.points
                .map((point) => `${point[0] - origin[0]},${point[2] - origin[2] + depth / 2}`)
                .join(' ')}
              fill="none"
              stroke="#444"
              strokeWidth={0.05}
              strokeDasharray="0.15 0.1"
            />
          ))}
        <text x={0} y={depth + 0.45} fontSize={0.3} textAnchor="middle" fill="currentColor">
          台口 · 观众方向
        </text>
      </svg>
      <figcaption>只读快照 · 虚线为当时保存的走位。</figcaption>
    </figure>
  )
}
