import { describe, expect, test } from 'bun:test'
import type { AnyNode, ParametricDescriptor } from '@pascal-app/core'
import { theatreParametrics } from './theatre-parametrics'
import { isTheatreEditableType } from './theatre-presentation'

const EmptyPanel = () => null
const legacyPanel = async () => ({ default: EmptyPanel })
const descriptor: ParametricDescriptor<AnyNode> = {
  groups: [
    {
      label: '尺寸',
      fields: [
        { key: 'height', kind: 'custom', component: EmptyPanel },
        { key: 'thickness', kind: 'custom', component: EmptyPanel },
        { key: 'terrainFill', kind: 'custom', component: EmptyPanel },
        { key: 'autoOpening', kind: 'custom', component: EmptyPanel },
      ],
    },
  ],
  customPanel: legacyPanel,
  trailingSection: legacyPanel,
  actions: [{ label: '工程参数', onClick: () => undefined }],
  derive: (_next, patch) => patch,
  reconcile: () => [],
}

describe('theatre inspector boundary', () => {
  test('retains only theatrical editable kinds and treats legacy kinds as read-only', () => {
    for (const type of ['wall', 'door', 'window', 'stair', 'block', 'item', 'slab']) {
      expect(isTheatreEditableType(type)).toBe(true)
      expect(theatreParametrics(type, descriptor)).toBeDefined()
    }
    for (const type of ['roof', 'terrain', 'duct', 'cabinet', 'building', 'legacy-plugin', null]) {
      expect(isTheatreEditableType(type)).toBe(false)
      expect(theatreParametrics(type, descriptor)).toBeUndefined()
    }
    expect(theatreParametrics('wall', undefined)).toBeUndefined()
  })

  test('isolates specialist panels and engineering fields while preserving store reconciliation', () => {
    const originalGroups = descriptor.groups
    const result = theatreParametrics('wall', descriptor)!
    expect(result.groups.flatMap((group) => group.fields.map((field) => field.key))).toEqual([
      'height',
      'thickness',
    ])
    expect(result.customPanel).toBeUndefined()
    expect(result.trailingSection).toBeUndefined()
    expect(result.actions).toBeUndefined()
    expect(result.derive).toBe(descriptor.derive)
    expect(result.reconcile).toBe(descriptor.reconcile)
    expect(descriptor.customPanel).toBe(legacyPanel)
    expect(descriptor.trailingSection).toBe(legacyPanel)
    expect(descriptor.groups).toBe(originalGroups)
    expect(descriptor.groups[0]?.fields).toHaveLength(4)
    expect(theatreParametrics('item', descriptor)?.customPanel).toBe(legacyPanel)
    expect(theatreParametrics('block', descriptor)?.customPanel).toBe(legacyPanel)
  })

  test('provides stage stair placement and bounded opening controls without old panels', () => {
    for (const type of ['stair', 'stair-segment']) {
      const fields = theatreParametrics(type, descriptor)!.groups.flatMap((group) => group.fields)
      expect(fields).toEqual([])
      expect(theatreParametrics(type, descriptor)?.customPanel).toBe(legacyPanel)
    }
    for (const type of ['door', 'window']) {
      const fields = theatreParametrics(type, descriptor)!.groups.flatMap((group) => group.fields)
      const opening = fields.find((field) => field.key === 'operationState')
      expect(opening).toMatchObject({ label: '开合程度', kind: 'number', min: 0, max: 1 })
      expect(fields.some((field) => field.key === 'autoOpening')).toBe(false)
    }
  })
})
