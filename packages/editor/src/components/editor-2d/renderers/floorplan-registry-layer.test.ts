import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type {
  AnyNode,
  AnyNodeId,
  FloorplanAffordanceSession,
  FloorplanGeometry,
  FloorplanPalette,
  LiveNodeOverrides,
} from '@pascal-app/core'
import { type AnyNodeDefinition, emitter, nodeRegistry, registerNode } from '@pascal-app/core'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { z } from 'zod'
import {
  FLOORPLAN_NODE_EXTENSION_KEY,
  floorplanGeometryMetadata,
} from '../../../lib/floorplan/floorplan-extension'
import {
  cancelFloorplanAffordanceDrag,
  collectFloorplanDependencyNodes,
  collectFloorplanLinkedLevelNodes,
  floorplanAffordanceReshapeScope,
  floorplanHandleDoubleClickAffordance,
  InteractiveGeometry,
  isFloorplanOpeningPlacementState,
  resolveFloorplanHandleUnitsPerPixel,
  splitFloorplanOverlay,
  subscribeFloorplanAffordanceToolCancel,
} from './floorplan-registry-layer'

describe('floorplan selection handle sizing', () => {
  test('caps visual handle growth at extreme zoom-out', () => {
    expect(resolveFloorplanHandleUnitsPerPixel(0.01)).toBe(0.01)
    expect(resolveFloorplanHandleUnitsPerPixel(0.1)).toBe(0.015)

    const palette = {
      selectedStroke: '#111111',
      selectedFill: '#ffffff',
      selectedHatch: '#111111',
      wallHoverStroke: '#111111',
      endpointHandleFill: '#ffffff',
      endpointHandleStroke: '#111111',
      endpointHandleHoverStroke: '#222222',
      endpointHandleActiveFill: '#333333',
      endpointHandleActiveStroke: '#444444',
      curveHandleFill: '#ffffff',
      curveHandleStroke: '#008080',
      curveHandleHoverStroke: '#00aaaa',
      measurementStroke: '#111111',
      measurementLabelBackground: '#ffffff',
      measurementLabelText: '#111111',
    } satisfies FloorplanPalette
    const noop = () => {}
    const markup = renderToStaticMarkup(
      createElement(
        'svg',
        null,
        createElement(InteractiveGeometry, {
          activeDragId: null,
          activeRotateNodeId: null,
          geometry: {
            kind: 'endpoint-handle',
            point: [0, 0],
            state: 'idle',
            affordance: 'move-endpoint',
            payload: { endpoint: 'start' },
          },
          hatchPatternId: undefined,
          hoveredHandleId: null,
          isMarqueeSelectionActive: false,
          nodeId: 'wall_test' as AnyNodeId,
          onHandleDoubleClick: noop,
          onHandleHoverChange: noop,
          onHandlePointerDown: noop,
          onMoveHandlePointerDown: noop,
          palette,
          sceneRotationDeg: 0,
          unitsPerPixel: 0.1,
        }),
      ),
    )

    expect(markup).toContain('r="0.12"')
    expect(markup).not.toContain('r="0.8"')
  })
})

describe('floorplan affordance ownership', () => {
  test('keeps the wall center curve drag owned by the floorplan dispatcher', () => {
    expect(floorplanAffordanceReshapeScope('wall-curve', 'wall_1', undefined)).toEqual({
      kind: 'reshaping',
      nodeId: 'wall_1',
      reshape: 'curve',
      driver: 'floorplan',
    })
  })
})

describe('floorplan affordance cancellation', () => {
  test('tool:cancel reverts the drag and makes a later pointerup inert', () => {
    const releasePointerCapture = mock(() => {})
    const commit = mock(() => {})
    const session: FloorplanAffordanceSession = {
      affectedIds: ['wall_a', 'wall_b'],
      apply: () => {},
      canCommit: () => true,
      commit,
    }
    const snapshots = [{ id: 'wall_a' as AnyNodeId, data: { width: 1 } }]
    const drag = {
      pointerId: 7,
      captureTarget: {
        hasPointerCapture: mock(() => true),
        releasePointerCapture,
      } as unknown as Element,
      handleId: 'wall_a:endpoint',
      session,
      snapshots,
      historyPaused: true,
      lastPlanPoint: [0, 0] as [number, number],
    }
    const dragRef = { current: drag }
    const restoreSnapshots = mock(() => {})
    const resumeHistory = mock(() => {})
    const clearPreview = mock(() => {})
    const clearSnapFeedback = mock(() => {})
    const endReshapeScope = mock(() => {})
    const clearDragFeedback = mock(() => {})
    const consumeToolCancel = mock(() => {})

    const unsubscribe = subscribeFloorplanAffordanceToolCancel(
      () =>
        cancelFloorplanAffordanceDrag(dragRef, {
          restoreSnapshots,
          resumeHistory,
          clearPreview,
          clearSnapFeedback,
          endReshapeScope,
          clearDragFeedback,
        }),
      consumeToolCancel,
    )

    try {
      emitter.emit('tool:cancel')
      emitter.emit('tool:cancel')
    } finally {
      unsubscribe()
    }

    expect(dragRef.current).toBeNull()
    expect(releasePointerCapture).toHaveBeenCalledWith(7)
    expect(restoreSnapshots).toHaveBeenCalledWith(snapshots)
    expect(resumeHistory).toHaveBeenCalledTimes(1)
    expect(clearPreview).toHaveBeenCalledTimes(2)
    expect(clearPreview).toHaveBeenNthCalledWith(1, 'wall_a')
    expect(clearPreview).toHaveBeenNthCalledWith(2, 'wall_b')
    expect(clearSnapFeedback).toHaveBeenCalledTimes(1)
    expect(endReshapeScope).toHaveBeenCalledWith(drag)
    expect(clearDragFeedback).toHaveBeenCalledTimes(1)
    expect(consumeToolCancel).toHaveBeenCalledTimes(1)
    expect(drag.historyPaused).toBe(false)

    const activeDrag = dragRef.current
    if (activeDrag?.pointerId === 7) activeDrag.session.commit?.()
    expect(commit).toHaveBeenCalledTimes(0)
  })
})

describe('floorplan opening placement interaction routing', () => {
  test('passes entries through only while an opening tool or moving opening is active', () => {
    expect(
      isFloorplanOpeningPlacementState({
        phase: 'structure',
        mode: 'build',
        tool: 'window',
        movingNodeHasWallOpeningPlacement: false,
      }),
    ).toBe(true)
    expect(
      isFloorplanOpeningPlacementState({
        phase: 'structure',
        mode: 'select',
        tool: null,
        movingNodeHasWallOpeningPlacement: true,
      }),
    ).toBe(true)
    expect(
      isFloorplanOpeningPlacementState({
        phase: 'structure',
        mode: 'select',
        tool: null,
        movingNodeHasWallOpeningPlacement: false,
      }),
    ).toBe(false)
  })
})

describe('floorplan vertex double-click routing', () => {
  test('routes polygon vertex handles to the kind-owned delete affordance', () => {
    expect(
      floorplanHandleDoubleClickAffordance({
        kind: 'endpoint-handle',
        point: [1, 2],
        state: 'idle',
        affordance: 'move-vertex',
        payload: { vertexIndex: 2 },
      }),
    ).toBe('delete-vertex')

    expect(
      floorplanHandleDoubleClickAffordance({
        kind: 'endpoint-handle',
        point: [1, 2],
        state: 'idle',
        affordance: 'move-endpoint',
        payload: { endpoint: 'end' },
      }),
    ).toBeNull()
  })
})

describe('floorplan annotation overlay routing', () => {
  test('keeps explicitly layered selection chrome above selected body fills', () => {
    const selectionHatch = {
      kind: 'line',
      x1: 0,
      y1: 0,
      x2: 0.2,
      y2: 0.2,
      stroke: '#3b82f6',
      metadata: floorplanGeometryMetadata({ renderPass: 'overlay' }),
    } satisfies FloorplanGeometry

    expect(splitFloorplanOverlay(selectionHatch)).toEqual({
      base: null,
      overlay: selectionHatch,
    })
  })

  test('registers upright zone labels for rotation-only presentation updates', () => {
    const noop = () => {}
    const markup = renderToStaticMarkup(
      createElement(
        'svg',
        null,
        createElement(InteractiveGeometry, {
          activeDragId: null,
          activeRotateNodeId: null,
          geometry: {
            kind: 'text',
            x: 4,
            y: 6,
            text: 'Kitchen',
            fontSize: 0.2,
            upright: true,
          },
          hatchPatternId: undefined,
          hoveredHandleId: null,
          isMarqueeSelectionActive: false,
          nodeId: 'zone_test' as AnyNodeId,
          onHandleDoubleClick: noop,
          onHandleHoverChange: noop,
          onHandlePointerDown: noop,
          onMoveHandlePointerDown: noop,
          palette: undefined,
          sceneRotationDeg: 180,
          unitsPerPixel: 0.01,
        }),
      ),
    )

    expect(markup).not.toContain('data-floorplan-annotation-label=""')
    expect(markup).toContain('data-floorplan-annotation-angle-radians="0"')
    expect(markup).toContain('data-floorplan-annotation-screen-upright="true"')
    expect(markup).toContain('data-floorplan-annotation-transform-before-rotation="translate(4 6)"')
    expect(markup).toContain('transform="translate(4 6) rotate(-180)"')
  })

  test('keeps automatic dimension strings left-to-right and top-to-bottom after rotation', () => {
    const noop = () => {}
    const renderAt180Degrees = (geometry: FloorplanGeometry) =>
      renderToStaticMarkup(
        createElement(
          'svg',
          null,
          createElement(InteractiveGeometry, {
            activeDragId: null,
            activeRotateNodeId: null,
            geometry,
            hatchPatternId: undefined,
            hoveredHandleId: null,
            isMarqueeSelectionActive: false,
            nodeId: 'wall_test' as AnyNodeId,
            onHandleDoubleClick: noop,
            onHandleHoverChange: noop,
            onHandlePointerDown: noop,
            onMoveHandlePointerDown: noop,
            palette: undefined,
            sceneRotationDeg: 180,
            unitsPerPixel: 0.01,
          }),
        ),
      )
    const dimensionString = (
      end: readonly [number, number],
      offsetNormal: readonly [number, number],
    ): FloorplanGeometry => ({
      kind: 'dimension-string',
      segments: [{ start: [0, 0], end, text: '2m' }],
      offsetNormal,
      offsetDistance: 0.55,
      extensionOvershoot: 0.12,
      textPosition: 'above',
    })

    expect(renderAt180Degrees(dimensionString([2, 0], [0, 1]))).toContain('rotate(-180)')
    expect(renderAt180Degrees(dimensionString([0, 2], [1, 0]))).toContain('rotate(-90)')
  })

  test('keeps a fixed mark pill together in the overlay pass', () => {
    const mark = {
      kind: 'group',
      metadata: floorplanGeometryMetadata({ annotationRole: 'opening-mark' }),
      children: [
        { kind: 'line', x1: 0, y1: 0, x2: 0, y2: 0.4 },
        { kind: 'rect', x: -0.2, y: 0.4, width: 0.4, height: 0.32 },
        { kind: 'text', x: 0, y: 0.56, text: '107', fontSize: 0.15, upright: true },
      ],
    } satisfies FloorplanGeometry

    expect(splitFloorplanOverlay(mark)).toEqual({ base: null, overlay: mark })
  })

  test('keeps fixed annotation symbols in the overlay pass for collision layout', () => {
    const columnCenter = {
      kind: 'line',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      metadata: floorplanGeometryMetadata({ annotationRole: 'column-center' }),
    } satisfies FloorplanGeometry

    expect(splitFloorplanOverlay(columnCenter)).toEqual({ base: null, overlay: columnCenter })
  })
})

describe('collectFloorplanDependencyNodes', () => {
  test('includes referenced hosts and their transform-owning parents', () => {
    const level = {
      id: 'level_test',
      type: 'level',
      parentId: null,
      children: ['platform_test'],
    } as unknown as AnyNode
    const platform = {
      id: 'platform_test',
      type: 'slab',
      parentId: level.id,
      children: [],
      position: [0, 0, 0],
      rotation: 0,
    } as unknown as AnyNode
    const measurement = {
      id: 'measurement_test',
      type: 'measurement',
      parentId: level.id,
    } as unknown as AnyNode
    const definition = {
      floorplanDependencies: () => [platform.id],
    } as unknown as AnyNodeDefinition

    expect(
      collectFloorplanDependencyNodes(
        definition,
        measurement,
        {
          [level.id]: level,
          [platform.id]: platform,
          [measurement.id]: measurement,
        },
        new Map<string, LiveNodeOverrides>([
          [platform.id, { position: [3, 0, 2] }],
          [level.id, { visible: false }],
        ]),
      ),
    ).toEqual([
      expect.objectContaining({ id: platform.id, position: [3, 0, 2] }),
      expect.objectContaining({ id: level.id, visible: false }),
    ])
  })
})

describe('collectFloorplanLinkedLevelNodes', () => {
  // Same containment as computeAffectedSiblingIds above: the fixture
  // definition has no `capabilities`, so it must not outlive this describe.
  let restoreRegistry: () => void

  beforeEach(() => {
    restoreRegistry = nodeRegistry._snapshot()
  })

  afterEach(() => restoreRegistry())

  test('projects a node onto a linked destination level with its real children', () => {
    nodeRegistry._reset()
    registerNode({
      kind: 'linked-floorplan-test',
      schemaVersion: 1,
      schema: z.object({ type: z.literal('linked-floorplan-test') }) as never,
      category: 'structure',
      defaults: () => ({}) as never,
      floorplan: () => null,
      extensions: {
        [FLOORPLAN_NODE_EXTENSION_KEY]: {
          linkedLevelIds: () => ['level_upper' as AnyNodeId],
        },
      },
    } as unknown as AnyNodeDefinition)
    const child = {
      id: 'linked_child',
      type: 'linked-child',
      parentId: 'linked_parent',
    } as unknown as AnyNode
    const parent = {
      id: 'linked_parent',
      type: 'linked-floorplan-test',
      parentId: 'level_lower',
      children: [child.id],
    } as unknown as AnyNode
    const nodes = { [parent.id]: parent, [child.id]: child }

    expect(collectFloorplanLinkedLevelNodes(nodes, 'level_upper' as AnyNodeId)).toEqual([
      { id: parent.id, node: parent, children: [child] },
    ])
    expect(
      collectFloorplanLinkedLevelNodes(
        nodes,
        'level_upper' as AnyNodeId,
        new Set([parent.id as AnyNodeId]),
      ),
    ).toEqual([])
  })
})
