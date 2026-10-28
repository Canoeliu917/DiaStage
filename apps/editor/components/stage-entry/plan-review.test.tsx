import { expect, test } from 'bun:test'
import { parseStageText, type SceneContextSummary, type StagePlan } from '@pascal-app/core/stage'
import { renderToStaticMarkup } from 'react-dom/server'
import { DIA_COLORS } from '@/lib/visual-system'
import { existingProposal, PlanDrawing, StagePlanReview, useStagePlanPreview } from './plan-review'

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

test('review footnotes distinguish explicit script evidence, inference and confirmation without asserting typed text came from a script', () => {
  const context: SceneContextSummary = {
    documentVersion: 1,
    venue: { type: 'proscenium', widthMeters: 8, depthMeters: 6, heightMeters: 4 },
    selectedObjectIds: [],
    objects: [],
  }
  const base = parseStageText('添加圆桌', context)!
  const plan: StagePlan = {
    ...base,
    source: 'script',
    items: [
      { ...base.items[0]!, certainty: 'stated' },
      {
        ...base.items[0]!,
        proposalId: 'inferred-chair',
        certainty: 'inferred',
        transform: {
          ...base.items[0]!.transform,
          position: { x: 2, y: 0, z: 3 },
        },
      },
    ],
  }
  const render = (value: StagePlan) =>
    renderToStaticMarkup(
      <StagePlanReview
        plan={value}
        context={context}
        compact
        busy={false}
        onChange={() => {}}
        onBack={() => {}}
        onConfirm={() => {}}
        onPreview={() => {}}
      />,
    )
  const before = JSON.stringify(plan)
  const markup = render(plan)
  expect(markup).toContain('aria-label="方案依据"')
  expect(markup).toContain('剧本明确写出 · 1 件')
  expect(markup).toContain('系统推测 · 1 件')
  expect(markup).toContain('需要确认 · 采用前核对台位')
  const typed = render({ ...plan, source: 'typed-command' })
  expect(typed).toContain('描述已给出 · 1 件')
  expect(typed).not.toContain('剧本明确写出')
  expect(JSON.stringify(plan)).toBe(before)
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

  const knowledgeReview = renderToStaticMarkup(
    <StagePlanReview
      plan={plan}
      context={context}
      compact
      editable={false}
      busy={false}
      onChange={() => {}}
      onBack={() => {}}
      onConfirm={() => {}}
      onPreview={() => {}}
    />,
  )
  expect(knowledgeReview).toContain('aria-disabled="true"')
  expect(knowledgeReview).toMatch(/<fieldset[^>]*disabled=""/u)
})

test('compact previews keep full names outside the SVG and draw identifiers above every outline', () => {
  const context: SceneContextSummary = {
    documentVersion: 1,
    venue: { type: 'proscenium', widthMeters: 8, depthMeters: 6, heightMeters: 4 },
    selectedObjectIds: [],
    objects: Array.from({ length: 20 }, (_, index) => ({
      id: `photo-${index}`,
      name: `照片布景 ${index + 1}：保留完整的较长名称`,
      kind: 'neutral-block',
      dimensionsMeters: { width: 0.6, height: 1, depth: 0.5 },
      transform: {
        position: { x: (index % 5) * 0.3, y: 0, z: 2 + Math.floor(index / 5) * 0.2 },
        rotationDegrees: { x: 0, y: 0, z: 0 },
      },
    })),
  }
  const plan: StagePlan = {
    schemaVersion: 1,
    source: 'manual',
    venue: null,
    items: context.objects.map((object) => existingProposal(object)),
    relations: [],
    assumptions: [],
    questions: [],
    evidence: [],
    warnings: [],
  }
  const original = JSON.stringify({ plan, context })
  const initial = useStagePlanPreview.getInitialState()
  const inspected = initial.inspectedId
  let markup: string
  try {
    initial.inspectedId = 'photo-19'
    markup = renderToStaticMarkup(
      <PlanDrawing plan={plan} context={context} compact live onMove={() => {}} />,
    )
  } finally {
    initial.inspectedId = inspected
  }
  const svg = markup.slice(markup.indexOf('<svg'), markup.indexOf('</svg>'))
  const text = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1])
  expect(text).not.toContain(context.objects[0]!.name)
  expect(text).toContain('01')
  expect(markup).toContain('aria-label="预览布景图例"')
  for (const object of context.objects) expect(markup).toContain(object.name)
  expect(markup.match(/aria-label="选中布景 /g)).toHaveLength(context.objects.length)
  expect(markup).toContain('aria-pressed="true" aria-label="选中布景 20：')
  expect(svg.indexOf('data-preview-labels="true"')).toBeGreaterThan(svg.lastIndexOf('<polygon'))
  expect(markup).toContain('红色表示穿模或边界问题')
  const full = renderToStaticMarkup(<PlanDrawing plan={plan} context={context} />)
  expect(full).not.toContain('stage-plan-legend')
  expect(full).toContain(`>${context.objects[0]!.name}</text>`)
  expect(JSON.stringify({ plan, context })).toBe(original)
})
