import { describe, expect, test } from 'bun:test'
import { type AnyNode, SlabNode, WallNode } from '@pascal-app/core'
import type { PrintExportReport } from './print-export'
import {
  applySemanticPrintFeatureThickness,
  measureSemanticPrintFeatureThickness,
} from './print-feature-thickness'

const nodes = {
  wall_test: WallNode.parse({
    id: 'wall_test',
    parentId: 'level_test',
    start: [0, 0],
    end: [4, 0],
    thickness: 0.2,
  }),
  slab_test: SlabNode.parse({
    id: 'slab_test',
    parentId: 'level_test',
    polygon: [
      [0, 0],
      [4, 0],
      [4, 3],
    ],
    thickness: 0.25,
  }),
} satisfies Record<string, AnyNode>

const report: PrintExportReport = {
  kind: 'print-export-report',
  version: 2,
  format: '3mf',
  scale: 100,
  units: 'millimeter',
  orientation: 'z-up',
  status: 'pass',
  bounds: null,
  triangleCount: 12,
  invalidTriangleCount: 0,
  degenerateTriangleCount: 0,
  boundaryEdgeCount: 0,
  nonManifoldEdgeCount: 0,
  connectedComponentCount: 1,
  solidComponentCount: 1,
  invertedWinding: false,
  volumeMm3: 100,
  diagnostics: [
    {
      severity: 'info',
      code: 'compiler_limits',
      message: 'Old compiler limit message.',
    },
  ],
}

describe('print feature thickness', () => {
  test('measures semantic wall and slab dimensions at print scale', () => {
    const measurement = measureSemanticPrintFeatureThickness(nodes, ['slab_test', 'wall_test'], 100)

    expect(measurement).toEqual({
      features: [
        { nodeId: 'slab_test', thicknessMm: 2.5 },
        { nodeId: 'wall_test', thicknessMm: 2 },
      ],
      unmeasuredNodeIds: [],
    })
  })

  test('blocks located semantic features below a custom target', () => {
    const measured = applySemanticPrintFeatureThickness(report, nodes, Object.keys(nodes), 2.2)

    expect(measured.status).toBe('blocked')
    expect(measured.minimumFeatureThicknessMm).toBeCloseTo(2)
    expect(measured.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'feature_below_target',
        nodeIds: ['wall_test'],
      }),
    )
    expect(measured.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'minimum_feature_thickness',
        nodeIds: ['wall_test'],
      }),
    )
  })

  test('does not certify a custom target when source-node coverage is incomplete', () => {
    const measured = applySemanticPrintFeatureThickness(
      report,
      nodes,
      ['wall_test', 'column_unmeasured'],
      1.5,
    )

    expect(measured.status).toBe('blocked')
    expect(measured.minimumFeatureThicknessMm).toBe(2)
    expect(measured.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'feature_thickness_incomplete',
        nodeIds: ['column_unmeasured'],
      }),
    )
  })

  test('does not certify a custom target from an empty measurement set', () => {
    const measured = applySemanticPrintFeatureThickness(report, nodes, [], 1.5)

    expect(measured.status).toBe('blocked')
    expect(measured.minimumFeatureThicknessMm).toBeNull()
    expect(measured.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'feature_thickness_incomplete',
      }),
    )
  })
})
