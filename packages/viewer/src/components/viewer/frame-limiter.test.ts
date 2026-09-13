import { describe, expect, test } from 'bun:test'
import { createFrameClock } from './frame-limiter'

describe('createFrameClock', () => {
  test('uses the first rAF sample only as a wall-time baseline', () => {
    const clock = createFrameClock(12)

    expect(clock.sample(60_000, 20)).toBeNull()
    expect(clock.sample(60_020, 20)).toBeCloseTo(12.02)
  })

  test('preserves the synthetic time across limiter restarts', () => {
    const firstLimiter = createFrameClock(0)
    firstLimiter.sample(1_000, 20)
    const priorTime = firstLimiter.sample(2_000, 20)
    if (priorTime === null) throw new Error('frame expected')

    const restartedLimiter = createFrameClock(priorTime)
    expect(restartedLimiter.sample(75_000, 1000 / 30)).toBeNull()
    expect(restartedLimiter.sample(75_034, 1000 / 30)).toBeCloseTo(priorTime + 1 / 30)
  })

  test('carries sub-frame remainder into the next sample', () => {
    const clock = createFrameClock()
    clock.sample(100, 20)

    expect(clock.sample(145, 20)).toBeCloseTo(0.04)
    expect(clock.sample(160, 20)).toBeCloseTo(0.06)
  })

  test('supports monotonic timer and resume kicks', () => {
    const clock = createFrameClock(2)

    expect(clock.step(0.02)).toBeCloseTo(2.02)
    expect(clock.step(0.001)).toBeCloseTo(2.021)
  })

  test('keeps every display frame at 60 Hz despite rounded timestamps', () => {
    const clock = createFrameClock()
    clock.sample(1_000, 1000 / 60)
    for (let i = 1; i <= 600; i++) {
      const timestamp = Math.round((1_000 + (i * 1000) / 60) * 10) / 10
      expect(clock.sample(timestamp, 1000 / 60)).toBeCloseTo(i / 60)
    }
  })
})
