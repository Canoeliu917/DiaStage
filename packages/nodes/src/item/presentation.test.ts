import { describe, expect, test } from 'bun:test'
import type { ItemNode } from '@pascal-app/core'
import { Euler, Matrix4, MeshStandardMaterial, Plane, Quaternion, Vector3 } from 'three'
import {
  createTranslucentItemMaterials,
  isSceneryPanelAsset,
  updateItemSectionPlane,
} from './presentation'

const asset = {
  id: 'SCN-FOLD-02',
  dimensions: [0.96, 2.4, 0.95],
  boundsCenter: [0.43, 1.2, 0.45],
} as ItemNode['asset']

describe('item display presentation', () => {
  test('transparency reuses temporary copies and preserves authored material', () => {
    const authored = new MeshStandardMaterial({ color: '#777777' })
    const variants = createTranslucentItemMaterials()
    const copy = variants.resolve(authored)
    expect(copy).not.toBe(authored)
    expect(variants.resolve(authored)).toBe(copy)
    expect(copy.opacity).toBe(0.24)
    expect(copy.transparent).toBe(true)
    expect(copy.depthWrite).toBe(false)
    expect(authored.opacity).toBe(1)
    expect(authored.transparent).toBe(false)
    let disposed = false
    copy.addEventListener('dispose', () => {
      disposed = true
    })
    variants.dispose()
    expect(disposed).toBe(true)
    expect(authored.color.getHexString()).toBe('777777')
    authored.dispose()
  })

  test('section preserves lower model and follows translation, three-axis rotation and scale', () => {
    const matrix = new Matrix4().compose(
      new Vector3(3, 2, -4),
      new Quaternion().setFromEuler(new Euler(0.3, 0.8, -0.2)),
      new Vector3(1.5, 2, 0.75),
    )
    const plane = new Plane()
    updateItemSectionPlane(plane, asset, 'cutaway', matrix)
    expect(plane.distanceToPoint(new Vector3(0.4, 0.5, 0.4).applyMatrix4(matrix))).toBeGreaterThan(
      0,
    )
    expect(plane.distanceToPoint(new Vector3(0.4, 2, 0.4).applyMatrix4(matrix))).toBeLessThan(0)
    expect(
      Math.abs(plane.distanceToPoint(new Vector3(0.4, 1.2, 0.4).applyMatrix4(matrix))),
    ).toBeLessThan(1e-9)
    updateItemSectionPlane(plane, asset, 'down', matrix)
    expect(plane.distanceToPoint(new Vector3(0.4, 0.2, 0.4).applyMatrix4(matrix))).toBeGreaterThan(
      0,
    )
    expect(plane.distanceToPoint(new Vector3(0.4, 0.4, 0.4).applyMatrix4(matrix))).toBeLessThan(0)
  })

  test('scenic enclosure controls include doors and windows but preserve furniture', () => {
    for (const id of [
      'SCN-FLAT-090',
      'SCN-FOLD-02',
      'SCN-FOLD-03',
      'SCN-WIN-130',
      'SCN-WIN-160',
      'SCN-DOOR-130',
      'SCN-DOOR-160',
    ])
      expect(isSceneryPanelAsset({ ...asset, id })).toBe(true)
    for (const id of ['SCN-TABLE-090', 'SCN-STOOL-035', 'SCN-RISER-01'])
      expect(isSceneryPanelAsset({ ...asset, id })).toBe(false)
  })
})
