import { expect, test } from 'bun:test'
import type { SceneContextSummary, StagePlan } from '@pascal-app/core/stage'
import { renderToStaticMarkup } from 'react-dom/server'
import { DIA_COLORS } from '@/lib/visual-system'
import { existingProposal, PlanDrawing, StagePlanReview } from './plan-review'

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
  const existing = markup.match(/<rect[^>]*fill="transparent"[^>]*>/u)?.[0]
  expect(existing).toContain('y="-0.25"')
  expect(existing).toContain('transform="rotate(30)"')
  expect(markup).toContain(`fill="${DIA_COLORS.ink}"`)
  expect(markup).toContain('transform="translate(0,0.5)"')
  expect(markup).toContain('data-existing="true"')
  expect(markup).toContain('data-proposal-id="chair"')
  expect(context.objects[0]?.transform.position.z).toBe(4.5)
})

test('the live stage remains neutral while a pending proposal uses Dia blue', () => {
  const object = {
    id: 'item_prop-preview',
    name: '台件',
    kind: 'neutral-block' as const,
    dimensionsMeters: { width: 1, height: 1, depth: 1 },
    transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
  }
  const context: SceneContextSummary = {
    documentVersion: 1,
    venue: { type: 'proscenium', widthMeters: 8, depthMeters: 6, heightMeters: 4 },
    selectedObjectIds: [],
    objects: [object],
  }
  const plan: StagePlan = {
    schemaVersion: 1,
    source: 'manual',
    venue: null,
    items: [existingProposal(object)],
    relations: [],
    assumptions: [],
    questions: [],
    evidence: [],
    warnings: [],
  }
  const live = renderToStaticMarkup(<PlanDrawing plan={plan} context={context} live />)
  expect(live).toMatch(new RegExp(`<polygon[^>]*fill="${DIA_COLORS.ink}"`))
  expect(live).not.toContain(`fill="${DIA_COLORS.blue}"`)
  const pending = renderToStaticMarkup(<PlanDrawing plan={plan} context={context} />)
  expect(pending).toMatch(new RegExp(`<polygon[^>]*fill="${DIA_COLORS.blue}"`))
  const review = renderToStaticMarkup(
    <StagePlanReview
      plan={plan}
      context={context}
      compact
      busy={false}
      onChange={() => {}}
      onBack={() => {}}
      onConfirm={() => {}}
      onPreview={() => {}}
    />,
  )
  expect(review).toContain('在舞台上试试')
  expect(review).not.toMatch(/<button[^>]*>采用<\/button>/u)
  expect(review).toContain('放弃')
})
