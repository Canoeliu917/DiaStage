import { expect, test } from 'bun:test'
import { recentProposalRounds } from '../rehearsal-intelligence/recent-rounds'
import type { ThreadMessage } from '../rehearsal-intelligence/schema'
import { AVAILABLE_STAGE_ASSET_IDS } from './prop-assets'
import { createStagePreset, STAGE_PRESETS } from './stage-presets'

test('presets use confirmed assets, preserve the venue and produce distinct placements', () => {
  const context = {
    documentVersion: 1,
    venue: { type: 'black-box' as const, widthMeters: 8, depthMeters: 6, heightMeters: 4 },
    objects: [],
    selectedObjectIds: [],
  }
  for (let index = 0; index < STAGE_PRESETS.length; index++) {
    const plan = createStagePreset(index, context)
    expect(plan.venue).toBeNull()
    expect(plan.items).toHaveLength(4)
    expect(
      plan.items.every((item) => AVAILABLE_STAGE_ASSET_IDS.includes(item.libraryAssetId!)),
    ).toBe(true)
    expect(new Set(plan.items.map((item) => JSON.stringify(item.transform.position))).size).toBe(4)
    expect(plan.warnings.filter((warning) => warning.blocking)).toEqual([])
  }
})

test('recent view keeps 20 discussion rounds and omits ambient stage update spam without deleting sources', () => {
  const messages: ThreadMessage[] = []
  for (let index = 0; index < 25; index++)
    for (const role of ['user', 'dia', 'system-state'] as const)
      messages.push({
        messageId: `${role}-${index}`,
        role,
        content: `${index}`,
        createdAt: new Date().toISOString(),
        sceneVersion: 'v1',
      })
  const rounds = recentProposalRounds(messages)
  expect(rounds).toHaveLength(20)
  expect(rounds[0]![0]!.content).toBe('5')
  expect(rounds.flat().some((entry) => entry.role === 'system-state')).toBe(false)
  expect(messages).toHaveLength(75)
})
