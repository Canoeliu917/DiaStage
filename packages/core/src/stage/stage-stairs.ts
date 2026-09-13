import { z } from 'zod'
import type { AnyNode } from '../schema'
import { StairNode } from '../schema/nodes/stair'
import { StairSegmentNode } from '../schema/nodes/stair-segment'
import { stairFootprintAABB } from '../systems/stair/stair-footprint'

const length = z.number().finite().positive().max(1000)
export const StageStairParametersSchema = z.object({
  width: length.default(1.2),
  stepHeight: length.default(0.15),
  stepDepth: length.default(0.3),
  stepCount: z.number().int().min(1).max(200).default(3),
  position: z
    .tuple([z.number().finite(), z.number().finite(), z.number().finite()])
    .default([0, 0, 0]),
  rotation: z.number().finite().default(0),
})
export type StageStairParameters = z.infer<typeof StageStairParametersSchema>

export function stageStairBounds(stair: StairNode, nodes: Readonly<Record<string, AnyNode>>) {
  const box = stairFootprintAABB({ ...stair, position: [0, 0, 0], rotation: 0 }, nodes)
  const segment = nodes[stair.children[0] ?? '']
  if (!box || segment?.type !== 'stair-segment') throw new Error('台阶缺少可用的踏步几何。')
  return {
    dimensions: [box.maxX - box.minX, segment.height, box.maxZ - box.minZ] as [
      number,
      number,
      number,
    ],
    boundsCenter: [(box.minX + box.maxX) / 2, segment.height / 2, (box.minZ + box.maxZ) / 2] as [
      number,
      number,
      number,
    ],
  }
}

export function createStageStair(input: unknown, parentId: string, name = '舞台台阶') {
  const p = StageStairParametersSchema.parse(input)
  const segment = StairSegmentNode.parse({
    name: '踏步数据',
    width: p.width,
    height: p.stepHeight * p.stepCount,
    length: p.stepDepth * p.stepCount,
    stepCount: p.stepCount,
  })
  const stair = StairNode.parse({
    name,
    parentId,
    width: p.width,
    position: p.position,
    rotation: p.rotation,
    stepCount: p.stepCount,
    totalRise: segment.height,
    supportSlabId: 'ground',
    children: [segment.id],
    metadata: { stageKind: 'stairs', representation: 'physical' },
  })
  return { stair, segment: { ...segment, parentId: stair.id } }
}

export function readStageStair(
  stair: StairNode,
  nodes: Readonly<Record<string, AnyNode>>,
): StageStairParameters {
  const segment = nodes[stair.children[0] ?? '']
  if (stair.children.length !== 1 || segment?.type !== 'stair-segment') {
    throw new Error('旧式组合楼梯已只读保留；请添加新的舞台台阶。')
  }
  return StageStairParametersSchema.parse({
    width: segment.width,
    stepHeight: segment.height / segment.stepCount,
    stepDepth: segment.length / segment.stepCount,
    stepCount: segment.stepCount,
    position: stair.position,
    rotation: stair.rotation,
  })
}

export function updateStageStair(
  stair: StairNode,
  nodes: Readonly<Record<string, AnyNode>>,
  patch: Partial<StageStairParameters>,
) {
  const p = StageStairParametersSchema.parse({ ...readStageStair(stair, nodes), ...patch })
  const segment = nodes[stair.children[0]!]
  if (segment?.type !== 'stair-segment') throw new Error('台阶缺少踏步数据。')
  return [
    {
      id: stair.id,
      data: {
        width: p.width,
        position: p.position,
        rotation: p.rotation,
        stepCount: p.stepCount,
        totalRise: p.stepHeight * p.stepCount,
      },
    },
    {
      id: segment.id,
      data: {
        width: p.width,
        height: p.stepHeight * p.stepCount,
        length: p.stepDepth * p.stepCount,
        stepCount: p.stepCount,
      },
    },
  ]
}
