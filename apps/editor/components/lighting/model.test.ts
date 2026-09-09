import { describe, expect, test } from 'bun:test'
import {
  createStageLight,
  isValidLightPose,
  MAX_STAGE_LIGHTS,
  validateLightingProject,
} from './model'

describe('lighting project boundary', () => {
  test('defaults are editable copies and round-trip as a versioned project', () => {
    const light = createStageLight('key', 0)
    expect(light).toEqual({
      id: 'key',
      name: '聚光灯 1',
      enabled: true,
      position: [2, 4, 2],
      target: [0, 0, 0],
      intensity: 150,
      color: '#ffffff',
      angle: 45,
      penumbra: 0.5,
    })
    const input = { version: 1, lights: [light] }
    const parsed = validateLightingProject(JSON.parse(JSON.stringify(input)))
    expect(parsed).toEqual(input)
    expect(validateLightingProject({ version: 1, lights: [] }).lights).toEqual([])
    light.position[0] = 9
    expect(parsed.lights[0]!.position).toEqual([2, 4, 2])
    expect(createStageLight('fill', 1).position).toEqual([2, 4, 2])
  })

  test('accepts four lights at the documented numeric boundaries', () => {
    const lights = Array.from({ length: MAX_STAGE_LIGHTS }, (_, index) => ({
      ...createStageLight(`light-${index}`, index),
      position: [-10_000, 10_000, 0],
      intensity: index % 2 ? 0 : 1000,
      angle: index % 2 ? 5 : 90,
      penumbra: index % 2 ? 0 : 1,
      color: '#A09fF0',
    }))
    expect(validateLightingProject({ version: 1, lights }).lights).toHaveLength(4)
    expect(() =>
      validateLightingProject({ version: 1, lights: [...lights, createStageLight('fifth', 4)] }),
    ).toThrow()
    expect(() => validateLightingProject({ version: 1, lights: [lights[0], lights[0]] })).toThrow(
      '灯具 ID 不可重复',
    )
  })

  test('rejects malformed JSON shapes without coercing or discarding unknown fields', () => {
    const light = createStageLight('key', 0)
    for (const input of [
      null,
      [],
      { version: 2, lights: [] },
      { version: 1, lights: [], hidden: true },
      { version: 1, lights: [{ ...light, enabled: 'true' }] },
      { version: 1, lights: [{ ...light, position: [2, 4] }] },
      { version: 1, lights: [{ ...light, position: [2, 4, 2, 1] }] },
      { version: 1, lights: [{ ...light, intensity: '150' }] },
      { version: 1, lights: [{ ...light, unexpected: 'value' }] },
    ]) {
      expect(() => validateLightingProject(input)).toThrow('布光工程格式无效')
    }
  })

  test('rejects invalid scalar values, text, and colors', () => {
    const light = createStageLight('key', 0)
    for (const patch of [
      { id: '' },
      { id: 'a'.repeat(129) },
      { name: ' ' },
      { name: 'a'.repeat(161) },
      { intensity: -1 },
      { intensity: 1001 },
      { intensity: Number.NaN },
      { intensity: Number.POSITIVE_INFINITY },
      { angle: 4.99 },
      { angle: 90.01 },
      { penumbra: -0.01 },
      { penumbra: 1.01 },
      { color: '#fff' },
      { color: '#gg0000' },
      { color: 'red' },
    ]) {
      expect(() =>
        validateLightingProject({ version: 1, lights: [{ ...light, ...patch }] }),
      ).toThrow()
    }
  })

  test('uses the same finite coordinate and minimum aim distance rule as the renderer', () => {
    const light = createStageLight('key', 0)
    for (const position of [
      [Number.NaN, 1, 2],
      [Number.NEGATIVE_INFINITY, 1, 2],
      [10_000.01, 1, 2],
      [-10_000.01, 1, 2],
      [0, 0, 0],
      [1e-12, 0, 0],
      [0.0001, 0, 0],
    ]) {
      expect(() =>
        validateLightingProject({ version: 1, lights: [{ ...light, position }] }),
      ).toThrow()
    }
    expect(isValidLightPose([0, 0, 0], [0, 0, 0])).toBe(false)
    expect(isValidLightPose([1e-12, 0, 0], [0, 0, 0])).toBe(false)
    expect(isValidLightPose([0.0001, 0, 0], [0, 0, 0])).toBe(false)
    expect(isValidLightPose([0.0001, 0.0001, 0], [0, 0, 0])).toBe(true)
    expect(isValidLightPose([2, 4, 2], [0, Number.NaN, 0])).toBe(false)
    expect(isValidLightPose([2, 4, 2], [0, 10_001, 0])).toBe(false)
    expect(() =>
      validateLightingProject({ version: 1, lights: [{ ...light, target: light.position }] }),
    ).toThrow('须相距超过 0.0001 米')
  })
})
