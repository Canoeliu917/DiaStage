import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  type AnyNodeId,
  acquireSceneReadOnlyLease,
  clearSceneHistory,
  emitter,
  sceneRegistry,
  subscribeSceneCommits,
  useLiveNodeOverrides,
  useLiveTransforms,
  useScene,
} from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import { Object3D, Vector3 } from 'three'
import { updateCameraDirector } from '@/lib/camera-director'
import { sampleRehearsal } from '@/lib/theatre/blocking'
import { addEmptyTableExample, createTheatreSceneGraph } from '@/lib/theatre/new-production'
import {
  actorObservationPose,
  audienceObservationPose,
  venueAudiencePositions,
} from '@/lib/theatre/presentation'
import {
  readTheatreDocument,
  restoreRehearsalTake,
  saveRehearsalTake,
  writeTheatreDocument,
} from '@/lib/theatre/scene-adapter'
import { activeRehearsalScene } from '@/lib/theatre/schema'
import { cameraPlanPoint } from '../camera-studio/camera-stage-floorplan'
import { useCameraStudio } from '../camera-studio/store'
import { createTheatrePropPreview, theatreParentMatrix } from './prop-preview'
import { applyObservationPose } from './runtime'
import { createTheatreSceneVisibility, rehearsalSceneSelection } from './scene-visibility'
import { subscribeRehearsalProtection, useRehearsalPlayback } from './state'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
const sceneId = 'theatre-playback-test'
let cleanup: (() => void) | undefined

function setDirectorBusy(status: 'idle' | 'playing') {
  updateCameraDirector(
    sceneId,
    (state) => ({ ...state, transport: { ...state.transport, status } }),
    { persist: false },
  )
}

beforeEach(() => {
  useRehearsalPlayback.getState().stop()
  useScene.getState().setReadOnly(false)
  useLiveTransforms.getState().clearAll()
  useLiveNodeOverrides.getState().clearAll()
  sceneRegistry.clear()
  useEditor.setState({
    workspaceMode: 'edit',
    isFirstPersonMode: false,
    isCaptureMode: false,
    isPreviewMode: false,
    activeSidebarPanel: 'theatre-roles',
  })
  useCameraStudio.setState({ playing: false, previewing: false, recording: false })
  setDirectorBusy('idle')
  const graph = createTheatreSceneGraph()
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  clearSceneHistory()
  useRehearsalPlayback.getState().configure(sceneId, true)
})

afterEach(() => {
  cleanup?.()
  cleanup = undefined
  useRehearsalPlayback.getState().stop()
  useScene.getState().setReadOnly(false)
  useLiveTransforms.getState().clearAll()
  useLiveNodeOverrides.getState().clearAll()
  sceneRegistry.clear()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

describe('theatre playback isolation', () => {
  test('play, pause and seek keep a read-only lease; Stop restores it without a scene commit', () => {
    const original = useScene.getState().nodes
    const camera = useCameraStudio.getState().project
    let commits = 0
    const stopCommits = subscribeSceneCommits(() => commits++)
    const state = useRehearsalPlayback.getState()
    state.play()
    expect(useRehearsalPlayback.getState().playing).toBe(true)
    expect(useScene.getState().readOnly).toBe(true)
    state.seek(3)
    state.pause()
    expect(useScene.getState().readOnly).toBe(true)
    expect(useRehearsalPlayback.getState()).toMatchObject({ time: 3, previewing: true })
    state.stop()
    stopCommits()
    expect(useScene.getState().readOnly).toBe(false)
    expect(useRehearsalPlayback.getState()).toMatchObject({ time: 0, previewing: false })
    expect(useScene.getState().nodes).toBe(original)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
    expect(commits).toBe(0)
    expect(useCameraStudio.getState().project).toBe(camera)
  })

  test('Stop does not release another mode’s read-only lease', () => {
    useRehearsalPlayback.getState().play()
    const releaseOtherMode = acquireSceneReadOnlyLease()
    useRehearsalPlayback.getState().stop()
    expect(useScene.getState().readOnly).toBe(true)
    releaseOtherMode()
    expect(useScene.getState().readOnly).toBe(false)
    useScene.getState().setReadOnly(true)
    useRehearsalPlayback.getState().play()
    expect(useRehearsalPlayback.getState().previewing).toBe(false)
    expect(useScene.getState().readOnly).toBe(true)
  })

  test('nonfinite seeks do not enter playback, and the time cannot exceed the scene', () => {
    const state = useRehearsalPlayback.getState()
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -1]) state.seek(invalid)
    expect(useRehearsalPlayback.getState()).toMatchObject({ time: 0, previewing: false })
    state.seek(100000)
    expect(useRehearsalPlayback.getState().time).toBe(20)
    state.play()
    expect(useRehearsalPlayback.getState().time).toBe(0)
  })

  test('both camera runtimes and first-person, Capture, Preview and Studio block a new rehearsal', () => {
    for (const mode of ['isFirstPersonMode', 'isCaptureMode', 'isPreviewMode'] as const) {
      useEditor.setState({ [mode]: true })
      useRehearsalPlayback.getState().play()
      expect(useRehearsalPlayback.getState().previewing).toBe(false)
      useEditor.setState({ [mode]: false })
    }
    useEditor.setState({ workspaceMode: 'studio' })
    useRehearsalPlayback.getState().play()
    expect(useRehearsalPlayback.getState().previewing).toBe(false)
    useEditor.setState({ workspaceMode: 'edit' })
    useCameraStudio.setState({ playing: true })
    useRehearsalPlayback.getState().play()
    expect(useRehearsalPlayback.getState().previewing).toBe(false)
    useCameraStudio.setState({ playing: false })
    setDirectorBusy('playing')
    useRehearsalPlayback.getState().play()
    expect(useRehearsalPlayback.getState().previewing).toBe(false)
    expect(useScene.getState().readOnly).toBe(false)
  })

  test('opening a camera mode or replacing the scene stops playback synchronously', () => {
    cleanup = subscribeRehearsalProtection(sceneId, () => {})
    useRehearsalPlayback.getState().play()
    setDirectorBusy('playing')
    expect(useRehearsalPlayback.getState().previewing).toBe(false)
    expect(useScene.getState().readOnly).toBe(false)
    setDirectorBusy('idle')
    useRehearsalPlayback.getState().play()
    useCameraStudio.setState({ previewing: true })
    expect(useRehearsalPlayback.getState().previewing).toBe(false)
    useCameraStudio.setState({ previewing: false })
    useRehearsalPlayback.getState().play()
    useEditor.setState({ isCaptureMode: true })
    expect(useRehearsalPlayback.getState().previewing).toBe(false)
    useEditor.setState({ isCaptureMode: false })
    useRehearsalPlayback.getState().play()
    useScene.setState({ nodes: { ...useScene.getState().nodes } })
    expect(useRehearsalPlayback.getState().previewing).toBe(false)
    expect(useScene.getState().readOnly).toBe(false)
  })

  test('scene navigation and unmount release the preview lease', () => {
    cleanup = subscribeRehearsalProtection(sceneId, () => {})
    useRehearsalPlayback.getState().play()
    useRehearsalPlayback.getState().configure('another-scene', true)
    expect(useScene.getState().readOnly).toBe(false)
    useRehearsalPlayback.getState().play()
    cleanup()
    cleanup = undefined
    expect(useScene.getState().readOnly).toBe(false)
  })
})

describe('linked prop visual overrides', () => {
  test('previewed props retain saved transforms and Stop restores their visible pose before unlocking edits', () => {
    const scene = activeRehearsalScene(addEmptyTableExample())
    const prop = scene.props[0]!
    const originalNodes = useScene.getState().nodes
    const node = originalNodes[prop.nodeId as AnyNodeId]!
    if (node.type !== 'block') throw new Error('test fixture must contain a block prop')
    const object = new Object3D()
    object.position.set(...node.position)
    sceneRegistry.nodes.set(node.id, object)
    const originalPosition = object.position.clone()
    const preview = createTheatrePropPreview()
    let restoredWhileReadOnly = false
    cleanup = subscribeRehearsalProtection(sceneId, () => {
      restoredWhileReadOnly = useScene.getState().readOnly
      preview.restore()
    })
    clearSceneHistory()
    useRehearsalPlayback.getState().seek(5)
    preview.apply(sampleRehearsal(scene, 5).props)
    expect(object.position.equals(originalPosition)).toBe(false)
    expect(useLiveNodeOverrides.getState().get(node.id)).toHaveProperty('theatrePreview', true)
    expect(useScene.getState().nodes).toBe(originalNodes)
    useRehearsalPlayback.getState().stop()
    expect(restoredWhileReadOnly).toBe(true)
    expect(object.position.equals(originalPosition)).toBe(true)
    expect(useLiveNodeOverrides.getState().get(node.id)).toBeUndefined()
    expect(useScene.getState().readOnly).toBe(false)
    expect(useScene.getState().nodes).toBe(originalNodes)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  })

  test('world-space prop targets and plan points account for parent translation and rotation', () => {
    const scene = activeRehearsalScene(addEmptyTableExample())
    const prop = scene.props[0]!
    const nodes = useScene.getState().nodes
    const node = nodes[prop.nodeId as AnyNodeId]!
    const level = nodes[node.parentId!]!
    const parent = nodes[level.parentId!]!
    if (parent.type !== 'building') throw new Error('fixture needs a stage container')
    useScene
      .getState()
      .updateNode(parent.id, { position: [10, 4, -6], rotation: [0, Math.PI / 2, 0] })
    const frame = theatreParentMatrix(useScene.getState().nodes, level.id)
    const world = new Vector3(2, 1, -3).applyMatrix4(frame)
    const plan = cameraPlanPoint(world.toArray(), frame)
    expect(plan[0]).toBeCloseTo(2)
    expect(plan[2]).toBeCloseTo(-3)
    const group = new Object3D()
    frame.decompose(group.position, group.quaternion, group.scale)
    const object = new Object3D()
    group.add(object)
    sceneRegistry.nodes.set(node.id, object)
    const preview = createTheatrePropPreview()
    preview.apply([
      { propId: prop.id, nodeId: node.id, position: world.toArray(), holderRoleId: null },
    ])
    expect(object.position.x).toBeCloseTo(2)
    expect(object.position.y).toBeCloseTo(1)
    expect(object.position.z).toBeCloseTo(-3)
    expect(object.getWorldPosition(new Vector3()).distanceTo(world)).toBeLessThan(1e-8)
    preview.restore()
  })

  test('conflicting live edits are preserved and invalid positions never enter overrides', () => {
    const scene = activeRehearsalScene(addEmptyTableExample())
    const pose = sampleRehearsal(scene, 5).props[0]!
    const preview = createTheatrePropPreview()
    useLiveNodeOverrides.getState().set(pose.nodeId!, { position: [9, 2, 4] })
    expect(() => preview.apply([pose])).toThrow('其他操作')
    expect(useLiveNodeOverrides.getState().get(pose.nodeId!)?.position).toEqual([9, 2, 4])
    useRehearsalPlayback.getState().play()
    expect(useRehearsalPlayback.getState().previewing).toBe(false)
    useLiveNodeOverrides.getState().clearAll()
    expect(() => preview.apply([{ ...pose, position: [Number.NaN, 0, 0] }])).toThrow('非法数值')
    expect(useLiveNodeOverrides.getState().overrides.size).toBe(0)
  })
})

describe('rehearsal scene presentation', () => {
  test('audience framing contains every stage corner on desktop, tablet and phone canvases', () => {
    const venue = readTheatreDocument()!.venue
    const fov = 50
    for (const aspect of [1100 / 820, 422 / 784, 390 / 430]) {
      const pose = audienceObservationPose(venue, fov, aspect)
      const backward = new Vector3(...pose.position).sub(new Vector3(...pose.target)).normalize()
      const right = new Vector3(1, 0, 0)
      const up = new Vector3().crossVectors(backward, right)
      for (const x of [-venue.width / 2, venue.width / 2]) {
        for (const y of [0, venue.height]) {
          for (const z of [-venue.depth / 2, venue.depth / 2]) {
            const relative = new Vector3(x, y, z).sub(new Vector3(...pose.position))
            const depth = -relative.dot(backward)
            expect(depth).toBeGreaterThan(0)
            expect(Math.abs(relative.dot(right)) / depth).toBeLessThan(
              Math.tan((fov * Math.PI) / 360) * aspect,
            )
            expect(Math.abs(relative.dot(up)) / depth).toBeLessThan(Math.tan((fov * Math.PI) / 360))
          }
        }
      }
    }
  })

  test('an explicit observation cancels a pending floorplan camera pose before moving the camera', () => {
    const calls: string[] = []
    const cancel = () => calls.push('cancel')
    emitter.on('camera-controls:cancel-pose', cancel)
    try {
      applyObservationPose(
        {
          setLookAt: () => {
            calls.push('observe')
            return Promise.resolve()
          },
        },
        [0, 1.6, 7.2],
        [0, 0.9, 0],
        true,
      )
      expect(calls).toEqual(['cancel', 'observe'])
    } finally {
      emitter.off('camera-controls:cancel-pose', cancel)
    }
  })

  test('reopening a scene selects its owned scenery level rather than the first empty stage level', () => {
    const emptyDocument = readTheatreDocument()!
    const fallback = rehearsalSceneSelection(emptyDocument.activeSceneId)
    expect(fallback?.levelId).toBe(
      Object.values(useScene.getState().nodes).find((node) => node.type === 'level')?.id,
    )
    const first = activeRehearsalScene(addEmptyTableExample())
    const second = activeRehearsalScene(addEmptyTableExample())
    const nodes = useScene.getState().nodes
    const firstSelection = rehearsalSceneSelection(first.id)
    const secondSelection = rehearsalSceneSelection(second.id)
    expect(firstSelection?.levelId).toBe(nodes[first.props[0]!.nodeId as AnyNodeId]!.parentId)
    expect(secondSelection?.levelId).toBe(nodes[second.props[0]!.nodeId as AnyNodeId]!.parentId)
    expect(firstSelection?.levelId).not.toBe(secondSelection?.levelId)
    expect(firstSelection?.levelId).not.toBe(fallback?.levelId)
    expect(secondSelection?.selectedIds).toEqual([])
    expect(useScene.getState().nodes).toBe(nodes)
  })

  test('actor observation stays outside its own head and looks along the sampled facing', () => {
    for (const height of [1, 1.7, 2.2]) {
      for (const facing of [0, Math.PI / 2, Math.PI]) {
        const pose = actorObservationPose([4, 2, -3], facing, height)
        const head = new Vector3(4, 2 + height * 0.88, -3)
        expect(new Vector3(...pose.position).distanceTo(head)).toBeGreaterThan(height * 0.11)
        const forward = new Vector3(...pose.target).sub(new Vector3(...pose.position)).normalize()
        expect(forward.x).toBeCloseTo(Math.sin(facing))
        expect(forward.z).toBeCloseTo(Math.cos(facing))
        expect(forward.y).toBe(0)
      }
    }
  })

  test('non-active scenery is filtered without changing saved nodes or blocking theatre edits', () => {
    const firstDocument = addEmptyTableExample()
    const firstScene = activeRehearsalScene(firstDocument)
    const secondDocument = addEmptyTableExample()
    const secondScene = activeRehearsalScene(secondDocument)
    const original = useScene.getState().nodes
    const display = createTheatreSceneVisibility()
    display.apply(secondScene.id)
    const hidden = useLiveNodeOverrides.getState().overrides
    expect(hidden.size).toBe(5)
    expect(hidden.get(firstScene.props[0]!.nodeId!)).toEqual({
      theatreSceneVisibility: true,
      visible: false,
    })
    expect(hidden.has(secondScene.props[0]!.nodeId!)).toBe(false)
    expect(useScene.getState().nodes).toBe(original)
    expect(() => writeTheatreDocument(secondDocument)).not.toThrow()
    useRehearsalPlayback.getState().play()
    expect(useRehearsalPlayback.getState().playing).toBe(true)
    useRehearsalPlayback.getState().stop()
    display.apply(firstScene.id)
    expect(useLiveNodeOverrides.getState().get(firstScene.props[0]!.nodeId!)).toBeUndefined()
    expect(useLiveNodeOverrides.getState().get(secondScene.props[0]!.nodeId!)).toHaveProperty(
      'visible',
      false,
    )
    useLiveNodeOverrides.getState().set(secondScene.props[0]!.nodeId!, { position: [1, 2, 3] })
    expect(() => writeTheatreDocument(secondDocument)).toThrow('结束')
    display.restore()
    expect(useLiveNodeOverrides.getState().get(secondScene.props[0]!.nodeId!)).toEqual({
      position: [1, 2, 3],
    })
  })

  test('hidden-scene filtering survives version save and restore without entering snapshots or the undo graph', () => {
    const first = addEmptyTableExample()
    const second = addEmptyTableExample()
    const display = createTheatreSceneVisibility()
    display.apply(second.activeSceneId)
    const saved = saveRehearsalTake('两场置景版本')
    const take = saved.takes.at(-1)!
    const capturedTake = JSON.stringify(take)
    expect(useLiveNodeOverrides.getState().overrides.size).toBe(5)
    for (const node of Object.values(take.stage.nodes)) {
      expect(node).not.toHaveProperty('theatreSceneVisibility')
      expect(node.visible).toBe(true)
    }
    const next = readTheatreDocument()!
    next.activeSceneId = first.activeSceneId
    writeTheatreDocument(next)
    display.apply(next.activeSceneId)
    const letterId = activeRehearsalScene(next).props[0]!.nodeId as AnyNodeId
    useScene.getState().updateNode(letterId, { position: [3, 2, 1] })
    const beforeRestore = JSON.parse(JSON.stringify(useScene.getState().nodes))
    clearSceneHistory()
    restoreRehearsalTake(take.id)
    display.apply(readTheatreDocument()!.activeSceneId)
    expect(readTheatreDocument()!.activeSceneId).toBe(second.activeSceneId)
    expect(JSON.stringify(readTheatreDocument()!.takes.at(-1))).toBe(capturedTake)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    expect(() => JSON.stringify(useScene.getState().nodes)).not.toThrow()
    useScene.temporal.getState().undo()
    expect(useScene.getState().nodes).toEqual(beforeRestore)
    display.restore()
    const state = useScene.getState()
    const reopened = JSON.parse(
      JSON.stringify({ nodes: state.nodes, rootNodeIds: state.rootNodeIds }),
    )
    useScene.getState().setScene(reopened.nodes, reopened.rootNodeIds)
    expect(readTheatreDocument()!.activeSceneId).toBe(first.activeSceneId)
    expect(readTheatreDocument()!.takes).toHaveLength(1)
  })

  test('audience positions distinguish frontal, thrust and arena theatres using world-space venue bounds', () => {
    const venue = {
      ...readTheatreDocument()!.venue,
      origin: [10, 3, -4] as [number, number, number],
    }
    expect(venueAudiencePositions(venue)).toHaveLength(1)
    const thrust = venueAudiencePositions({ ...venue, type: 'thrust' })
    expect(thrust.map((entry) => entry.id)).toEqual(['front', 'left', 'right'])
    const arena = venueAudiencePositions({ ...venue, type: 'arena' })
    expect(arena).toHaveLength(4)
    expect(arena.find((entry) => entry.id === 'left')!.position[0]).toBeLessThan(
      venue.origin[0] - venue.width / 2,
    )
    expect(arena.find((entry) => entry.id === 'rear')!.position[2]).toBeLessThan(
      venue.origin[2] - venue.depth / 2,
    )
    expect(venueAudiencePositions({ ...venue, type: 'proscenium' })).toHaveLength(1)
    expect(venueAudiencePositions({ ...venue, type: 'classroom' })).toHaveLength(1)
  })
})
