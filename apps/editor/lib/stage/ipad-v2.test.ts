import { expect, test } from 'bun:test'
import { ItemNode, useScene } from '@pascal-app/core'
import { prepareStageCollision, type SceneContextObject } from '@pascal-app/core/stage'
import {
  openGroundingPlacement,
  parseOpenLanguage,
  validateOpenGrounding,
} from '../rehearsal-intelligence/open-language'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { useStageContactFeedback } from './contact-feedback'
import { stageContactIds } from './contacts'
import { stageContextObject, stageFrame } from './context'
import { floorSafeItemPatch } from './floor-transform'
import { snapStageObject } from './placement-snap'
import { AVAILABLE_STAGE_SCENERY } from './prop-assets'
import { rigidRotation, STAGE_ROTATION_STEP, stageManipulationCenter } from './rigid-rotation'
import { spatialConstraintsForProposal } from './spatial-constraints'
import { solveSpatialConstraints } from './spatial-solver'

const box = (id: string, x: number, y = 0): SceneContextObject => ({
  id,
  name: id,
  kind: 'platform',
  dimensionsMeters: { width: 1, height: 1, depth: 1 },
  transform: { position: { x, y, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
})
const snapshot = () => ({
  documentVersion: 1,
  venue: { type: 'black-box' as const, widthMeters: 12, depthMeters: 10, heightMeters: 5 },
  selectedObjectIds: ['a', 'b'],
  objects: [box('a', -2), box('b', 2)].map((item) => ({
    ...item,
    kind: 'scenic-flat' as const,
    dimensionsMeters: { width: 2, height: 2.4, depth: 0.1 },
  })),
})

for (const phrase of [
  '用两个景片围一个空间，中间留个入口。',
  '两块景片围空间，留一个入口',
  '拿二片景片围一下，中间留个入口',
])
  test(`two-flat partial enclosure: ${phrase}`, () => {
    const scene = snapshot(),
      before = JSON.stringify(scene)
    const grounding = parseOpenLanguage(phrase)!
    expect(grounding).not.toBeNull()
    const resolved = validateOpenGrounding(grounding, phrase, {
      objects: scene.objects.map(({ id, name, kind }) => ({ id, name, kind })),
      selectedObjectIds: scene.selectedObjectIds,
      sceneVersion: 'v1',
      proposal: null,
      lastReferencedIds: [],
    })
    const mapped = openGroundingPlacement(resolved, scene)
    if ('type' in mapped) throw new Error('expected placement')
    expect(mapped.status).toBe('proposal')
    const proposal = mapped.knowledgeProposal!
    const constraints = spatialConstraintsForProposal(proposal)
    expect(constraints[0]!.parameters.shape).toBe('partial')
    const result = solveSpatialConstraints({
      snapshot: scene,
      assets: scene.objects,
      proposal,
      constraints,
    })
    expect(result.candidates.length).toBeGreaterThan(0)
    expect(result.warnings.join(' ')).toContain('不完整')
    for (const candidate of result.candidates) {
      expect(candidate.plan.items).toHaveLength(2)
      expect(candidate.clearanceRegions[0]!.widthMeters).toBeGreaterThanOrEqual(0.8)
      expect(candidate.constraintsUnsatisfied).toEqual([])
    }
    expect(JSON.stringify(scene)).toBe(before)
  })
for (const phrase of [
  '不要用两个景片围一个空间',
  '用两个景片围一个空间并且飞起来',
  '两块还是三块景片围一个空间',
])
  test(`partial enclosure contrast: ${phrase}`, () => {
    expect(parseOpenLanguage(phrase)?.requiresClarification).toBe(true)
  })

test('exact edge and support contact are not penetration; real overlaps and floor penetration remain red', () => {
  for (const touching of [box('b', 1), box('b', 0, 1)]) {
    expect(stageContactIds([box('a', 0), touching]).size).toBe(2)
    expect(stageContactIds([box('a', 0), touching], true).size).toBe(0)
  }
  expect(stageContactIds([box('a', 0), box('b', 0.99)], true).size).toBe(2)
  expect(stageContactIds([box('a', 0, -0.01)], true).size).toBe(1)
  const nodes = useScene.getState().nodes
  useStageContactFeedback.setState({ signature: 'overlap', acknowledged: 'overlap' })
  expect(stageContactIds([box('a', 0), box('b', 0.99)], true).size).toBe(2)
  expect(useScene.getState().nodes).toBe(nodes)
})
test('lateral platform drag snaps side-to-side without selecting the top support', () => {
  const moving = box('b', 1.07)
  const scene = { ...snapshot(), objects: [box('a', 0)] }
  const result = snapStageObject(moving.transform.position, moving, scene, {
    grid: 0,
    guides: true,
  })
  expect(result.position.x).toBeCloseTo(1)
  expect(result.position.y).toBe(0)
  expect(result.labels).toContain('贴合 a')
})
test('all 22 library assets: single Euler component, 30 degree default and stage floor clamp without writes', () => {
  const previous = useScene.getState()
  const graph = createTheatreSceneGraph()
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const initialNodes = useScene.getState().nodes
  const level = Object.values(graph.nodes).find((node) => node.type === 'level')!
  try {
    expect(AVAILABLE_STAGE_SCENERY).toHaveLength(22)
    expect(STAGE_ROTATION_STEP).toBeCloseTo(Math.PI / 6)
    for (const entry of AVAILABLE_STAGE_SCENERY) {
      const node = ItemNode.parse({
        asset: entry.asset,
        parentId: level.id,
        position: [0, 0, 0],
        rotation: [0.2, 0.3, 0.4],
      })
      const before = JSON.stringify(node)
      for (const [index, axis] of (['x', 'y', 'z'] as const).entries()) {
        const patch = rigidRotation(node, axis, 30) as Partial<ItemNode>
        for (const i of [0, 1, 2])
          expect(patch.rotation![i]! - node.rotation[i]!).toBeCloseTo(i === index ? Math.PI / 6 : 0)
        const next = { ...node, ...floorSafeItemPatch(node, patch) }
        const object = stageContextObject(next, { ...graph.nodes, [node.id]: next }, stageFrame())!
        expect(prepareStageCollision(object).bounds[1]![0]).toBeGreaterThanOrEqual(-1e-6)
      }
      expect(JSON.stringify(node)).toBe(before)
      if (entry.asset.id.startsWith('SCN-FOLD')) {
        expect(
          stageManipulationCenter({
            ...node,
            asset: {
              ...node.asset,
              bounds: [
                [-9, -9, -9],
                [9, 9, 9],
              ],
            },
          }),
        ).toEqual(stageManipulationCenter(node))
      }
    }
    expect(useScene.getState().nodes).toBe(initialNodes)
  } finally {
    useScene.setState(previous)
  }
})
