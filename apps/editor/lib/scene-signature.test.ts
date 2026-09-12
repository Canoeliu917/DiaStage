import { expect, test } from 'bun:test'
import {
  type PersistedSceneGraph,
  sceneContentVersion,
  sceneGraphSignature,
} from './scene-signature'

const NODE_ID = 'level_a1b2c3d4e5f6g7h8'
const MATERIAL_ID = 'mat_a1b2c3d4e5f6g7h8'

const graph = (overrides: Partial<PersistedSceneGraph> = {}) =>
  ({
    nodes: { [NODE_ID]: { object: 'node', id: NODE_ID, type: 'level', level: 0 } },
    rootNodeIds: [NODE_ID],
    ...overrides,
  }) as PersistedSceneGraph

// The echo check compares a raw SSE payload against the store after
// `setScene` ran, and `setScene` always writes these three keys. A payload
// that omits them — which is exactly what MCP live sync sends — must still
// match, or every remote update looks like a local edit and gets saved back.
test('an omitted field signs the same as its applied default', () => {
  expect(sceneGraphSignature(graph())).toBe(
    sceneGraphSignature(graph({ collections: {}, materials: {}, installedPlugins: [] })),
  )
})

// Conversely, every field the save body carries has to be signed. An unsigned
// field makes a local edit that touches only that field read as an echo, and
// the save is skipped — the change is silently lost.
test('changing any signed field changes the signature', () => {
  const base = sceneGraphSignature(graph())

  expect(
    sceneGraphSignature(
      graph({ materials: { [MATERIAL_ID]: { id: MATERIAL_ID, name: 'Oak', material: {} } } }),
    ),
  ).not.toBe(base)
  expect(
    sceneGraphSignature(graph({ collections: { col_1: { id: 'col_1', nodeIds: [] } } })),
  ).not.toBe(base)
  expect(sceneGraphSignature(graph({ installedPlugins: ['@pascal-app/plugin-trees'] }))).not.toBe(
    base,
  )
})

test('content identity preserves exact geometry, finishes and topology independent of object key ordering', () => {
  const base = graph({
    nodes: {
      [NODE_ID]: {
        id: NODE_ID,
        type: 'block',
        parentId: null,
        children: [],
        rotation: 0,
        metadata: { stageKind: 'neutral-block', stageLocked: false },
      },
    },
    materials: { [MATERIAL_ID]: { id: MATERIAL_ID, name: '灰', material: { preset: 'concrete' } } },
  })
  const signature = sceneContentVersion(base)
  const reordered = {
    ...base,
    nodes: Object.fromEntries(
      Object.entries(base.nodes).map(([id, node]) => [
        id,
        Object.fromEntries(Object.entries(node).reverse()),
      ]),
    ),
  }
  expect(sceneContentVersion(reordered)).toBe(signature)
  expect(sceneContentVersion({ ...base, collections: {}, installedPlugins: [] })).toBe(signature)
  for (const patch of [
    { rotation: Math.PI / 2 },
    { parentId: 'different-parent' },
    { children: ['new-child'] },
    { metadata: { stageKind: 'neutral-block', stageLocked: true } },
  ])
    expect(
      sceneContentVersion({ ...base, nodes: { [NODE_ID]: { ...base.nodes[NODE_ID], ...patch } } }),
    ).not.toBe(signature)
  expect(
    sceneContentVersion({
      ...base,
      materials: { [MATERIAL_ID]: { id: MATERIAL_ID, name: '木', material: { preset: 'wood' } } },
    }),
  ).not.toBe(signature)
})

test('saved versions and receipts cannot recursively alter the content they identify', () => {
  const base = graph({
    nodes: { [NODE_ID]: { id: NODE_ID, type: 'site', metadata: { stageHeightMeasured: true } } },
  })
  const signature = sceneContentVersion(base)
  const bookkeeping = [
    'diastageVersionSource',
    'diastageBuildDecision',
    'diastageRehearsalDecision',
    'diastageRemountDecision',
    'diastageRehearsalVersions',
    'diastageRestoredView',
    'stageTransaction',
    'remoteCommandReceipts',
    'remount',
    'legacy',
  ]
  for (const key of bookkeeping)
    expect(
      sceneContentVersion(
        graph({
          nodes: {
            [NODE_ID]: {
              id: NODE_ID,
              type: 'site',
              metadata: { stageHeightMeasured: true, [key]: { changed: true } },
            },
          },
        }),
      ),
    ).toBe(signature)
  expect(
    sceneContentVersion(
      graph({
        nodes: {
          [NODE_ID]: { id: NODE_ID, type: 'site', metadata: { stageHeightMeasured: false } },
        },
      }),
    ),
  ).not.toBe(signature)
})
