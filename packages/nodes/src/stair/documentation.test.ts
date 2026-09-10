import { expect, test } from 'bun:test'
import type { GeometryContext } from '@pascal-app/core'
import { createStageStair } from '@pascal-app/core/stage'
import { buildFloorplanStairEntry, createFloorplanContextExtensions } from '@pascal-app/editor'
import { buildStairDocumentation } from './documentation'
import { buildStairFloorplan } from './floorplan'

test('stage plan shows every tread and simple step dimensions without a storey break', () => {
  const { stair, segment } = createStageStair({}, 'level_test')
  const entry = buildFloorplanStairEntry(stair, [segment])!
  const ctx: GeometryContext = {
    resolve: () => undefined,
    children: [segment],
    siblings: [],
    extensions: createFloorplanContextExtensions({ purpose: 'edit' }),
  }
  const notes = buildStairDocumentation(stair, entry, ctx)
  expect(notes).toHaveLength(1)
  expect(notes[0]).toMatchObject({
    kind: 'text',
    text: '3 级 · 步高 0.15m · 步深 0.3m · 总宽 1.2m',
  })
  const plan = buildStairFloorplan(stair, ctx)
  if (plan?.kind !== 'group') throw new Error('missing stage stair plan')
  expect(plan.children.filter((n) => n.kind === 'polygon' && n.fill === '#262626')).toHaveLength(
    entry.segments[0]!.treadBars.length,
  )
  expect(JSON.stringify(plan)).not.toMatch(
    /segment-width|segment-length|curved-sweep|楼层|上行|下行|踢面/,
  )
})
