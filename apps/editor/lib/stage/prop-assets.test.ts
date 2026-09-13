import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ItemNode } from '@pascal-app/core'
import {
  parseStageText,
  resolveStageObjectSpecs,
  type SceneContextSummary,
  type StageCommand,
} from '@pascal-app/core/stage'
import { planStageRequest } from '../ai/stage-planner'
import { groundStageAssets } from './ground-assets'
import {
  AVAILABLE_STAGE_ASSET_IDS,
  AVAILABLE_STAGE_SCENERY,
  STAGE_PROP_MENU,
  stagePropAssetUrl,
  stagePropCollisionGeometry,
} from './prop-assets'
import { makeScenery, SCENERY_LIBRARY } from './scenery'

const context: SceneContextSummary = {
  documentVersion: 0,
  venue: { type: 'proscenium', widthMeters: 12, depthMeters: 8, heightMeters: 5 },
  objects: [],
  selectedObjectIds: [],
}

test('installed menu maps 22 canonical models and 44 correctly sized PNGs without modifying source bytes', () => {
  expect(AVAILABLE_STAGE_ASSET_IDS).toHaveLength(22)
  expect(new Set(AVAILABLE_STAGE_ASSET_IDS).size).toBe(22)
  expect(
    STAGE_PROP_MENU.categories.map(
      (category) => STAGE_PROP_MENU.assets.filter((prop) => prop.category === category).length,
    ),
  ).toEqual([3, 4, 5, 2, 4, 4])
  for (const prop of STAGE_PROP_MENU.assets) {
    const bytes = readFileSync(resolve(import.meta.dir, '../../public/stage-library', prop.model))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(prop.model_sha256)
    expect(bytes.toString('ascii', 0, 4)).toBe('glTF')
    expect(bytes.readUInt32LE(4)).toBe(2)
    for (const [file, size] of [
      [prop.thumbnail, 256],
      [prop.preview, 512],
    ] as const) {
      const png = readFileSync(resolve(import.meta.dir, '../../public/stage-library', file))
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      expect(png.readUInt32BE(16)).toBe(size)
      expect(png.readUInt32BE(20)).toBe(size)
      expect(png[25]).toBe(6)
    }
    const installed = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === prop.id)!
    expect(SCENERY_LIBRARY.find(({ asset }) => asset.id === prop.id)).toBe(installed)
    expect(installed.asset.src).toBe(stagePropAssetUrl(prop.model))
    expect(installed.asset.thumbnail).toBe(stagePropAssetUrl(prop.thumbnail))
    const bounds = resolveStageObjectSpecs(prop.id)[0]!.modelDimensions!
    expect(installed.asset.dimensions![0]).toBeCloseTo(bounds.width, 12)
    expect(installed.asset.dimensions![1]).toBeCloseTo(bounds.height, 12)
    expect(installed.asset.dimensions![2]).toBeCloseTo(bounds.depth, 12)
  }
})

for (const prop of STAGE_PROP_MENU.assets) {
  test(`${prop.id}: language and server create independent meter-scale instances of the same installed asset`, async () => {
    const before = structuredClone(context)
    const parsed = parseStageText(`添加${prop.name}`, context)!
    expect(parsed.questions).toEqual([])
    const plan = groundStageAssets(parsed)
    expect(plan.questions).toEqual([])
    expect(plan.items).toHaveLength(1)
    expect(plan.items[0]!.collisionGeometry).toBeDefined()
    const serverPlan = await planStageRequest(
      {
        source: 'typed-command',
        input: `添加${prop.name}`,
        sceneContext: context,
        priorAnswers: [],
      },
      new AbortController().signal,
      async () => {
        throw new Error('canonical placement must not call a model')
      },
    )
    expect(serverPlan.items[0]!.libraryAssetId).toBe(prop.id)
    expect(serverPlan.items[0]!.dimensionsMeters).toEqual(plan.items[0]!.dimensionsMeters)
    const proposal = plan.items[0]!
    const command: Extract<StageCommand, { type: 'AddScenery' }> = {
      type: 'AddScenery',
      meta: {
        commandId: 'prop-test:0',
        transactionId: 'prop-test',
        source: 'manual',
        issuedAt: '2026-09-13T00:00:00Z',
        expectedDocumentVersion: 0,
      },
      nodeId: 'prop-test:proposal',
      name: proposal.displayName,
      kind: proposal.kind,
      libraryAssetId: proposal.libraryAssetId,
      dimensionsMeters: proposal.dimensionsMeters,
      transform: proposal.transform,
    }
    const first = ItemNode.parse(makeScenery(command, 'level_test', [0, 0, 4], [0, 0, 0])[0])
    const second = ItemNode.parse(makeScenery(command, 'level_test', [2, 0, 4], [0, 0, 0])[0])
    expect(first.id).not.toBe(second.id)
    expect(first.asset.src).toBe(second.asset.src)
    expect(first.scale).toEqual([1, 1, 1])
    expect(first.asset.offset).toEqual([0, 0, 0])
    expect(first.asset.rotation).toEqual([0, 0, 0])
    expect(first.asset.scale).toEqual([1, 1, 1])
    expect(first.asset.boundsCenter).toBeDefined()
    first.position[0] = 7
    expect(second.position[0]).toBe(2)
    expect(context).toEqual(before)
  })
}

test('fold pivots and open-door bounds are preserved separately from menu specifications', () => {
  const fold = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === 'SCN-FOLD-02')!.asset
  expect(fold.boundsCenter).toEqual([0.46, 1.2, -0.44])
  expect(fold.dimensions).toEqual([0.92, 2.4, 0.92])
  const door = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === 'SCN-DOOR-130')!.asset
  expect(door.dimensions![2]).toBeCloseTo(0.48669697251359767)
  expect(door.boundsCenter![2]).toBeCloseTo(0.2023484862567988)
  const prop = STAGE_PROP_MENU.assets.find((entry) => entry.id === door.id)!
  expect(prop.dimensions_m.depth).toBe(0.08)
  expect(prop.dimensions_m.leaf_depth).toBe(0.035)
  expect(prop.assumed_fields).toContain('leaf_depth')
  const geometry = stagePropCollisionGeometry(fold.id, { width: 1.84, height: 4.8, depth: 1.84 })!
  const vertices = geometry.flatMap((part) => part.vertices)
  expect(Math.min(...vertices.map((point) => point[0]))).toBeCloseTo(0)
  expect(Math.max(...vertices.map((point) => point[0]))).toBeCloseTo(1.84)
  expect(Math.min(...vertices.map((point) => point[2]))).toBeCloseTo(-1.8)
  expect(Math.max(...vertices.map((point) => point[2]))).toBeCloseTo(0.04)
  expect(stagePropCollisionGeometry(null, { width: 1, height: 1, depth: 1 })).toBeUndefined()
})

test('an explicit 1.2m round table request clarifies instead of silently creating a 0.9m model', async () => {
  const parsed = parseStageText('添加圆桌', context)!
  parsed.items[0]!.libraryAssetId = null
  parsed.items[0]!.dimensionsMeters = { width: 1.2, height: 0.75, depth: 1.2 }
  const before = structuredClone(parsed)
  const plan = await planStageRequest(
    {
      source: 'typed-command',
      input: '添加直径1.2米圆桌',
      sceneContext: context,
      priorAnswers: [],
    },
    new AbortController().signal,
    async () => parsed,
  )
  expect(plan.items).toEqual([])
  expect(plan.questions).toHaveLength(1)
  expect(plan.questions[0]!.message).toContain('0.9 × 0.75 × 0.9')
  expect(plan.questions[0]!.message).toContain('1.2 × 0.75 × 1.2')
  expect(plan.questions[0]!.message).toContain('尺寸不一致')
  expect(parsed).toEqual(before)
})
