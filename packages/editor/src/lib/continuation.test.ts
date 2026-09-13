import { describe, expect, test } from 'bun:test'
import { CONTINUATION_PROFILES, continuationContextOf, nextContinuation } from './continuation'

describe('stage continuation', () => {
  test('keeps only wall, fence and point placement flows', () => {
    expect(continuationContextOf('wall')).toBe('wall')
    expect(continuationContextOf('fence')).toBe('fence')
    expect(continuationContextOf('item')).toBe('point')
    expect(continuationContextOf('lean-to-extension')).toBeNull()
    expect(nextContinuation('point', CONTINUATION_PROFILES.point.default)).toBe('repeat')
  })
})
