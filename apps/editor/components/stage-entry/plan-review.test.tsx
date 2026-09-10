import { expect, test } from 'bun:test'
import type { SceneContextSummary, StagePlan } from '@pascal-app/core/stage'
import { renderToStaticMarkup } from 'react-dom/server'
import { PlanDrawing } from './plan-review'

test('existing scenery previews keep their world position when the proposed stage depth changes', () => {
  const context: SceneContextSummary = {
    documentVersion: 1,
    venue: { type: 'proscenium', widthMeters: 8, depthMeters: 6, heightMeters: 4 },
    selectedObjectIds: [],
    objects: [
      {
        id: 'chair',
        name: '椅子',
        kind: 'chair',
        dimensionsMeters: { width: 0.5, height: 0.9, depth: 0.5 },
        transform: { position: { x: 0, y: 0, z: 4.5 }, rotationDegrees: { x: 0, y: 30, z: 0 } },
      },
    ],
  }
  const plan: StagePlan = {
    schemaVersion: 1,
    source: 'manual',
    venue: { ...context.venue!, depthMeters: 4 },
    items: [],
    relations: [],
    assumptions: [],
    questions: [],
    evidence: [],
    warnings: [],
  }
  const markup = renderToStaticMarkup(<PlanDrawing plan={plan} context={context} />)
  const existing = markup.match(/<rect[^>]*fill="#aaa"[^>]*>/u)?.[0]
  expect(existing).toContain('y="0.25"')
  expect(existing).toContain('transform="rotate(30,0,0.5)"')
  expect(context.objects[0]?.transform.position.z).toBe(4.5)
})
