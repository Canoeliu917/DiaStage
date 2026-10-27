import { expect, test } from 'bun:test'
import { AVAILABLE_STAGE_SCENERY } from './prop-assets'
import { SCENERY_ASSEMBLY_RULES } from './scenery-assembly-rules'

test('assembly guidance covers every selectable asset by its actual catalogue name', () => {
  expect(AVAILABLE_STAGE_SCENERY).toHaveLength(21)
  for (const { asset } of AVAILABLE_STAGE_SCENERY)
    expect(SCENERY_ASSEMBLY_RULES).toContain(asset.name)
})
