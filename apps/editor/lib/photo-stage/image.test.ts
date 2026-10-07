import { describe, expect, test } from 'bun:test'
import { photoCropRect } from './image'

describe('photo stage source crop', () => {
  test('half crops and the unequal reference panels use their respective boundaries', () => {
    expect(photoCropRect(1600, 1600, 'reference')).toEqual({
      x: 0,
      y: 960,
      width: 1600,
      height: 640,
    })
    expect(photoCropRect(2048, 2048, 'lower')).toEqual({ x: 0, y: 1024, width: 2048, height: 1024 })
    expect(photoCropRect(2048, 2048, 'upper')).toEqual({ x: 0, y: 0, width: 2048, height: 1024 })
    expect(photoCropRect(1600, 900, 'full')).toEqual({ x: 0, y: 0, width: 1600, height: 900 })
  })
  test('invalid dimensions cannot be used for reconstruction', () => {
    expect(() => photoCropRect(0, 200, 'full')).toThrow()
    expect(() => photoCropRect(100, Number.NaN, 'lower')).toThrow()
  })
})
