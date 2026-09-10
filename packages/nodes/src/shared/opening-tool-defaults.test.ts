import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

if (!process.env.OPENING_PRESET_RUNTIME_TEST) {
  test('door and window presets survive native hover, cancel and one-step placement', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, OPENING_PRESET_RUNTIME_TEST: '1' },
      encoding: 'utf8',
      timeout: 30_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  }, 40_000)
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  const core = await import('@pascal-app/core')
  const { createNodesWithSceneMaterials } = await import('../../../editor/src/lib/scene-clipboard')
  const { Group } = await import('three')
  const cleanups: Array<() => void> = []
  globalThis.requestAnimationFrame ??= () => 0
  globalThis.cancelAnimationFrame ??= () => {}
  Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {} } })
  const preview = { set() {}, clear() {}, node: null }
  const store = (state: Record<string, unknown>) =>
    Object.assign((select: (value: Record<string, unknown>) => unknown) => select(state), {
      getState: () => state,
    })
  const selection = { levelId: 'level_opening', selectedIds: [] as string[] }
  const viewer = {
    selection,
    cameraDragging: false,
    setSelection: (next: { selectedIds: string[] }) => {
      selection.selectedIds = next.selectedIds
    },
  }
  const editor = {
    toolDefaults: {} as Record<string, unknown>,
    setTool() {},
    getContinuation: () => 'single',
  }
  mock.module('react', () => ({
    ...React,
    useMemo: <T>(factory: () => T) => factory(),
    useRef: <T>(value: T) => ({ current: value }),
    useState: <T>(value: T) => [value, () => {}],
    useEffect: (effect: () => undefined | (() => void)) => {
      const cleanup = effect()
      if (cleanup) cleanups.push(cleanup)
    },
  }))
  mock.module('@pascal-app/editor', () => ({
    createNodesWithSceneMaterials,
    EDITOR_LAYER: 1,
    useEditor: store(editor),
    usePlacementPreview: store(preview),
    useAlignmentGuides: store({ clear() {}, set() {} }),
    useFacingPose: store({ clear() {}, set() {} }),
    isMagneticSnapActive: () => false,
    isValidWallSideFace: () => true,
    getSideFromNormal: () => 'front',
    calculateItemRotation: () => 0,
    triggerSFX() {},
    snapToHalf: (value: number) => value,
    clearPlacementSurface() {},
    publishPlacementSurface() {},
    useRegistryToolContext: () => ({
      activeLevelId: selection.levelId,
      isCameraDragging: () => false,
      selectNode: (id: string) => viewer.setSelection({ selectedIds: [id] }),
    }),
  }))
  mock.module('@pascal-app/viewer', () => ({
    useViewer: store(viewer),
    buildDoorPreviewMesh: () => new Group(),
    buildWindowPreviewMesh: () => new Group(),
  }))
  mock.module('./opening-guides-runtime', () => ({
    clearOpeningGuides3D() {},
    publishOpeningGuidesForWallEvent() {},
    resolveSillSnap: () => null,
  }))
  mock.module('./roof-wall-opening-placement', () => ({
    getRoofWallOpeningCursorPose() {},
    resolveRoofWallOpeningTarget() {},
    worldToSelectedBuildingLocal: (point: { toArray(): number[] }) => point.toArray(),
  }))
  mock.module('./dormer-wall-opening-placement', () => ({
    dormerEventFromHostedWindow() {},
    getDormerWindowWorldNormal() {},
    getDormerWindowWorldYaw() {},
    resolveDormerWindowTarget() {},
  }))
  const { doorToolParameters, windowToolParameters } = await import('./opening-tool-defaults')
  const DoorTool = (await import('../door/tool')).default
  const WindowTool = (await import('../window/tool')).default
  for (const kind of ['door', 'window'] as const) {
    const importedMaterial = core.SceneMaterial.parse({
      id: 'mat_opening',
      name: '预设玻璃',
      material: { properties: { color: '#123abc' } },
    })
    const oldMaterial = core.SceneMaterial.parse({
      ...importedMaterial,
      name: '原场景饰面',
      material: { properties: { color: '#ffffff' } },
    })
    const originalMaterials = { mat_opening: oldMaterial }
    const parameters = kind === 'door' ? doorToolParameters : windowToolParameters
    editor.toolDefaults = {
      [kind]: {
        width: 2.4,
        height: 2,
        openingKind: 'opening',
        openingShape: 'arch',
        archHeight: 0.4,
        material: { properties: { color: '#ff0000' } },
        slots: { glass: 'scene:mat_opening' },
        sceneMaterials: { mat_opening: importedMaterial },
        id: 'bad_original',
        wallId: 'wall_foreign',
      },
    }
    const parsed = parameters(editor.toolDefaults[kind])
    assert.equal(parsed.width, 2.4)
    assert(!('id' in parsed))
    assert(!('wallId' in parsed))
    const level = core.LevelNode.parse({ id: 'level_opening', children: ['wall_opening'] })
    const wall = core.WallNode.parse({
      id: 'wall_opening',
      parentId: level.id,
      start: [0, 0],
      end: [12, 0],
      height: 4,
    })
    core.useScene.setState({
      nodes: { [level.id]: level, [wall.id]: wall },
      rootNodeIds: [level.id],
      materials: originalMaterials,
      readOnly: false,
    })
    core.clearSceneHistory()
    core.useScene.temporal.getState().resume()
    const before = core.useScene.getState().nodes
    if (kind === 'door') DoorTool({})
    else WindowTool({})
    assert.equal(
      Object.keys(core.useScene.getState().nodes).length,
      2,
      'arming a preset does not insert a draft',
    )
    const event = {
      node: wall,
      position: [6, 1.5, 0] as [number, number, number],
      localPosition: [6, 1.5, 0] as [number, number, number],
      normal: [0, 0, 1] as [number, number, number],
      stopPropagation() {},
    }
    core.emitter.emit('wall:move', event as core.WallEvent)
    assert.deepEqual(core.useScene.getState().materials, originalMaterials)
    let draft = Object.values(core.useScene.getState().nodes).find((node) => node.type === kind)
    assert(draft && (draft.type === 'door' || draft.type === 'window'))
    assert.equal(draft.width, 2.4)
    assert.equal(draft.openingShape, 'arch')
    core.emitter.emit('tool:cancel')
    assert.deepEqual(core.useScene.getState().materials, originalMaterials)
    assert.deepEqual(core.useScene.getState().nodes, before)
    assert.equal(core.useScene.temporal.getState().pastStates.length, 0)
    core.emitter.emit('wall:move', event as core.WallEvent)
    core.emitter.emit('wall:click', event as core.WallEvent)
    draft = Object.values(core.useScene.getState().nodes).find((node) => node.type === kind)
    assert(draft && (draft.type === 'door' || draft.type === 'window'))
    assert.equal(draft.width, 2.4)
    assert.equal(draft.height, 2)
    assert.equal(draft.openingKind, 'opening')
    assert.equal(draft.openingShape, 'arch')
    assert.equal(draft.material?.properties?.color, '#ff0000')
    const materialRef = draft.slots?.glass
    assert(materialRef && materialRef !== 'scene:mat_opening')
    assert.equal(
      core.useScene.getState().materials[materialRef.slice(6)]?.material.properties?.color,
      '#123abc',
    )
    assert.deepEqual(core.useScene.getState().materials.mat_opening, oldMaterial)
    assert.equal(draft.parentId, wall.id)
    assert.equal(draft.metadata.isTransient, undefined)
    assert.equal(core.useScene.temporal.getState().pastStates.length, 1)
    for (const cleanup of cleanups.splice(0).reverse()) cleanup()
    core.useScene.temporal.getState().undo()
    assert.deepEqual(core.useScene.getState().nodes, before)
    assert.deepEqual(core.useScene.getState().materials, originalMaterials)
  }
}
