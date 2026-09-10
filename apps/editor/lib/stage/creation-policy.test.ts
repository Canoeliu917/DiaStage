import { expect, test } from 'bun:test'
import {
  compileStagePlan,
  parseStageText,
  type SceneContextSummary,
  type StageCommand,
} from '@pascal-app/core/stage'
import { handleCreationPermission } from '../ai/creation-permission'
import {
  type CreationLease,
  creationDecision,
  draftContext,
  mergeDraftPlan,
} from './creation-policy'

const context: SceneContextSummary = {
  documentVersion: 1,
  venue: { type: 'proscenium', widthMeters: 8, depthMeters: 6, heightMeters: 4 },
  objects: [],
  selectedObjectIds: [],
}
const plan = parseStageText('添加窗景片', context)!
const commands = compileStagePlan(plan, context, {
  transactionId: 'p1',
  issuedAt: new Date().toISOString(),
}).commands
const lease: CreationLease = {
  projectId: 'project',
  userId: 'owner',
  sessionId: 'session',
  mode: 'create',
  expiresAt: 10000,
}

test('suggest, missing ownership lease, expired or other project never automatically execute', () => {
  expect(creationDecision(null, 'project', commands, 0)).toBe('confirm')
  expect(creationDecision(lease, 'other', commands, 0)).toBe('confirm')
  expect(creationDecision(lease, 'project', commands, 10000)).toBe('confirm')
  expect(creationDecision(lease, 'project', commands, 0)).toBe('execute')
  expect(creationDecision({ ...lease, mode: 'draft' }, 'project', commands, 0)).toBe('draft')
})
test('delete, venue changes, 21 objects and non-whitelist requests always require confirmation', () => {
  const meta = commands[0]!.meta
  const risky: StageCommand[][] = [
    [{ type: 'RemoveObject', nodeId: 'window', meta }],
    [{ type: 'CreateStage', venue: context.venue!, meta }],
    Array.from({ length: 21 }, (_, n) => ({ ...commands[0]!, nodeId: `object-${n}` })),
  ]
  for (const batch of risky) expect(creationDecision(lease, 'project', batch, 0)).toBe('confirm')
})
test('draft accumulates changes without mutating original and compiles one final transaction', () => {
  const first = mergeDraftPlan(null, plan, context)
  const virtual = draftContext(context, first)
  const move = parseStageText('把它向台右移半米', virtual)!
  const second = mergeDraftPlan(first, move, context)
  expect(first.items[0]!.transform.position.x).toBe(0)
  expect(context.objects).toEqual([])
  expect(second.items).toHaveLength(1)
  expect(second.items[0]!.transform.position.x).toBe(0.5)
  const final = compileStagePlan(second, context, {
    transactionId: 'draft',
    issuedAt: new Date().toISOString(),
  })
  expect(final.ok).toBe(true)
  expect(new Set(final.commands.map((command) => command.meta.transactionId)).size).toBe(1)
})
test('selected layout commands use actual rotated edges and retain strict bounds checks', () => {
  const objects: SceneContextSummary['objects'] = [0, 1].map((n) => ({
    id: `scenery-${n}`,
    name: `景片${n}`,
    kind: 'scenic-flat',
    dimensionsMeters: { width: 1, height: 2, depth: 0.2 },
    transform: {
      position: { x: -2 + n * 2, y: 0, z: 2 + n },
      rotationDegrees: { x: 0, y: n * 90, z: 0 },
    },
  }))
  const selected = { ...context, objects, selectedObjectIds: objects.map((object) => object.id) }
  for (const text of [
    '选中布景沿台口对齐',
    '选中布景横向按30厘米净距分布',
    '选中布景缩放到0.5倍',
  ]) {
    const result = parseStageText(text, selected)
    expect(result?.items).toHaveLength(2)
    expect(
      compileStagePlan(result, selected, {
        transactionId: 'layout',
        issuedAt: new Date().toISOString(),
      }).ok,
    ).toBe(true)
  }
  const large = parseStageText('选中布景放大到100倍', selected)
  expect(
    compileStagePlan(large, selected, {
      transactionId: 'large',
      issuedAt: new Date().toISOString(),
    }).ok,
  ).toBe(false)
})
function request(
  cookie?: string,
  url = 'http://127.0.0.1/api/ai/creation-permission',
  remote = false,
) {
  return new Request(url, {
    method: 'POST',
    headers: {
      origin: new URL(url).origin,
      ...(cookie ? { cookie } : {}),
      ...(remote ? { 'x-diastage-remote-token': 'not-an-owner' } : {}),
    },
  })
}
test('explicit local desktop grant is HttpOnly, scoped, revocable, inactivity-limited; public/phone fail closed', () => {
  const input = {
    action: 'grant' as const,
    projectId: 'project',
    mode: 'create' as const,
    explainedAndConfirmed: true as const,
  }
  expect(handleCreationPermission(request(undefined, undefined, true), input).status).toBe(403)
  expect(
    handleCreationPermission(
      request(undefined, 'https://stage.example/api/ai/creation-permission'),
      input,
    ).status,
  ).toBe(403)
  expect(
    handleCreationPermission(request(), { ...input, explainedAndConfirmed: undefined }).status,
  ).toBe(403)
  const grant = handleCreationPermission(request(), input, 0)
  expect(
    handleCreationPermission(
      new Request('http://localhost:4320/api/ai/creation-permission', {
        headers: { host: '127.0.0.1:4320', origin: 'http://127.0.0.1:4320' },
      }),
      input,
      0,
    ).status,
  ).toBe(200)
  expect(
    handleCreationPermission(
      new Request('http://localhost:4320/api/ai/creation-permission', {
        headers: { host: 'stage.example', origin: 'https://stage.example' },
      }),
      input,
      0,
    ).status,
  ).toBe(403)
  expect(grant.cookie).toContain('HttpOnly')
  const cookie = grant.cookie!.split(';')[0]!
  expect(
    handleCreationPermission(request(cookie), { action: 'check', projectId: 'other' }, 1).status,
  ).toBe(403)
  expect(
    handleCreationPermission(request(cookie), { action: 'check', projectId: 'project' }, 1).status,
  ).toBe(200)
  expect(
    handleCreationPermission(
      request(cookie),
      { action: 'check', projectId: 'project' },
      30 * 60000 + 1,
    ).status,
  ).toBe(403)
  const second = handleCreationPermission(request(), input, 0).cookie!.split(';')[0]!
  handleCreationPermission(request(second), { action: 'revoke', projectId: 'project' }, 1)
  expect(
    handleCreationPermission(request(second), { action: 'check', projectId: 'project' }, 2).status,
  ).toBe(403)
})
