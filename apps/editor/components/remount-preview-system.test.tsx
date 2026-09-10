import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.REMOUNT_PREVIEW_RUNTIME_TEST) {
  test('scan previews follow live meshes and release only their own resources', () => {
    // Bun module mocks persist process-wide, so keep frame hooks isolated from other tests.
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, REMOUNT_PREVIEW_RUNTIME_TEST: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  const { BoxGeometry, Group, LineSegments, Mesh, MeshBasicMaterial } = await import('three')
  const frames: Array<() => void> = []
  const cleanups: Array<() => void> = []
  const registry = new Map<string, InstanceType<typeof Group>>()
  const scene = { rootNodeIds: ['site_test'], nodes: {}, readOnly: false }
  const editor = {
    activeSidebarPanel: 'remount',
    workspaceMode: 'edit',
    viewMode: '3d',
    isPreviewMode: false,
    isCaptureMode: false,
    isFirstPersonMode: false,
  }
  const interaction = { scope: { kind: 'idle' } }
  const venue = {
    frame: {
      origin: [0, 0, 0],
      stageRight: [1, 0, 0],
      up: [0, 1, 0],
      upstage: [0, 0, -1],
    },
    bounds: { width: 8, depth: 5, height: 4 },
    scanNodeId: 'scan_test',
  }
  const draft = {
    sceneKey: JSON.stringify(['scene_test', scene.rootNodeIds]),
    plan: { placements: [], paths: [], conflicts: [] },
    sourceVenue: venue,
    targetVenue: venue,
  }
  let previewCurrent = true
  const hook =
    <T,>(state: T) =>
    (select: (value: T) => unknown) =>
      select(state)
  mock.module('react', () => ({
    ...React,
    useMemo: <T,>(factory: () => T) => factory(),
    useEffect: (effect: () => undefined | (() => void)) => {
      const cleanup = effect()
      if (cleanup) cleanups.push(cleanup)
    },
  }))
  const registryState = { nodes: registry, revision: 0 }
  mock.module('@pascal-app/core', () => ({
    emitter: { emit() {} },
    sceneRegistry: registryState,
    useScene: Object.assign(hook(scene), { getState: () => scene }),
  }))
  mock.module('@pascal-app/editor', () => ({
    useEditor: hook(editor),
    useInteractionScope: hook(interaction),
  }))
  mock.module('@pascal-app/viewer', () => ({
    useIsolatedFrame: (frame: () => void) => frames.push(frame),
    OVERLAY_LAYER: 1,
    useViewer: hook({ renderPaused: false, isExporting: false }),
  }))
  mock.module('@react-three/fiber', () => ({
    useFrame: (frame: () => void) => frames.push(frame),
    useThree: hook({ camera: null, controls: null, invalidate() {} }),
  }))
  mock.module('../lib/camera-director', () => ({
    useCameraDirectorState: () => ({ transport: { status: 'idle' } }),
  }))
  mock.module('../lib/remount-scene', () => ({
    useRemountDraft: () => draft,
    isRemountPreviewCurrent: () => previewCurrent,
  }))
  mock.module('./camera-studio/store', () => ({
    useCameraStudio: hook({ playing: false, previewing: false }),
  }))
  const { RemountPreviewSystem } = await import('./remount-preview-system')
  type ComponentElement = {
    type: (props: Record<string, unknown>) => ComponentElement
    props: Record<string, unknown>
  }
  const outer = RemountPreviewSystem({ sceneId: 'scene_test' }) as unknown as ComponentElement
  const ghosts = outer.type(outer.props)
  const scan = (ghosts.props.children as ComponentElement[])[0]!
  const display = scan.type(scan.props)
  const output = display.props.object as InstanceType<typeof Group>
  const venueLines = (ghosts.props.children as ComponentElement[])[1]!
  const wireDisplay = venueLines.type(venueLines.props)
  const wire = wireDisplay.props.object
  assert(wire instanceof LineSegments)
  assert(!Array.isArray(wire.material))
  assert.equal(wire.material.transparent, true)
  assert.equal(wire.material.depthTest, false)
  assert.equal(wire.material.depthWrite, false)
  assert.equal(wire.frustumCulled, false)
  assert.equal(wire.layers.mask, 2)
  assert.equal(wire.renderOrder, 1000)
  assert.equal(wire.geometry.getAttribute('position').count, 24)
  const source = new Group()
  const traverse = source.traverseVisible.bind(source)
  let walks = 0
  source.traverseVisible = (callback) => {
    walks++
    traverse(callback)
  }
  source.position.set(3, 2, -4)
  source.rotation.y = 0.7
  source.scale.setScalar(1.4)
  const geometry = new BoxGeometry()
  const originalMaterial = new MeshBasicMaterial()
  let geometryDisposals = 0
  geometry.addEventListener('dispose', () => geometryDisposals++)
  const mesh = new Mesh(geometry, originalMaterial)
  mesh.position.set(2, 1, 3)
  source.add(mesh)
  registry.set('scan_test', source)
  const frame = frames[0]!
  frame()
  output.updateWorldMatrix(true, true)
  assert.equal(output.children.length, 1)
  const proxy = output.children[0]!
  assert(proxy instanceof Mesh)
  assert.equal(proxy.geometry, geometry)
  assert.notEqual(proxy.material, originalMaterial)
  assert(proxy.renderOrder < wire.renderOrder)
  assert(proxy.renderOrder > 0)
  assert.equal(output.layers.mask, 2)
  assert.equal(proxy.layers.mask, 2)
  const intersections: unknown[] = []
  proxy.raycast({} as never, intersections as never[])
  assert.equal(intersections.length, 0)
  assert.deepEqual(proxy.matrixWorld.elements, mesh.matrixWorld.elements)
  assert.equal(mesh.material, originalMaterial)
  assert.equal(display.props.dispose, null)
  for (let i = 0; i < 100; i++) frame()
  assert.equal(walks, 1, 'unchanged frames do not traverse the scan hierarchy')

  const replacementGeometry = new BoxGeometry()
  replacementGeometry.addEventListener('dispose', () => geometryDisposals++)
  mesh.geometry = replacementGeometry
  registryState.revision++
  frame()
  assert.equal(proxy.geometry, replacementGeometry)
  source.remove(mesh)
  frame()
  assert.equal(output.children.length, 0)
  source.add(mesh)
  frame()
  assert.equal(output.children.length, 1)
  source.visible = false
  frame()
  assert.equal(output.children.length, 0)
  source.visible = true
  frame()
  assert.equal(output.children.length, 1)
  const replacementRoot = new Group()
  registry.set('scan_test', replacementRoot)
  frame()
  assert.equal(output.children.length, 0)
  replacementRoot.add(mesh)
  replacementRoot.position.set(-5, 3, 7)
  frame()
  output.updateWorldMatrix(true, true)
  assert.deepEqual(output.children[0]!.matrixWorld.elements, mesh.matrixWorld.elements)
  registry.delete('scan_test')
  frame()
  assert.equal(output.children.length, 0)

  let materialDisposals = 0
  assert(!Array.isArray(proxy.material))
  proxy.material.addEventListener('dispose', () => materialDisposals++)
  for (const cleanup of cleanups) cleanup()
  assert.equal(geometryDisposals, 0)
  assert.equal(materialDisposals, 1)
  assert.equal(mesh.material, originalMaterial)

  scene.nodes = { savedCameraOnly: true }
  assert(RemountPreviewSystem({ sceneId: 'scene_test' }))
  previewCurrent = false
  assert.equal(RemountPreviewSystem({ sceneId: 'scene_test' }), null)
  previewCurrent = true
  interaction.scope.kind = 'moving'
  assert.equal(RemountPreviewSystem({ sceneId: 'scene_test' }), null)
  interaction.scope.kind = 'idle'
  assert.equal(RemountPreviewSystem({ sceneId: 'another_scene' }), null)
  console.log('Scan lifecycle, resource ownership, scene and interaction guards passed.')
}
