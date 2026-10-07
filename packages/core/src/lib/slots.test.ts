import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { deriveSlotId, isSlotMaterialName } from './slots'

test('stage library authored materials resolve to native paint slots', () => {
  const directory = new URL('../../../../apps/editor/public/stage-library/models/', import.meta.url)
  const files = readdirSync(directory).filter((name) => name.endsWith('.glb'))
  expect(files).toHaveLength(22)
  for (const file of files) {
    const buffer = readFileSync(new URL(file, directory))
    const gltf = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString())
    const materials = gltf.materials as { name: string }[]
    expect(materials.length).toBeGreaterThan(0)
    for (const material of materials) {
      expect(isSlotMaterialName(material.name)).toBe(true)
      expect(deriveSlotId(material.name)).toBeTruthy()
    }
  }
  expect(deriveSlotId('Matte warm grey / 暖灰软包')).toBe('upholstery')
})

test('uploaded paint slot ids stay stable and unknown material labels remain unchanged', () => {
  expect(deriveSlotId('SLOT_Bed_Frame.001')).toBe('bed_frame')
  expect(isSlotMaterialName('Matte unknown')).toBe(false)
  expect(deriveSlotId('Matte unknown')).toBeNull()
})
