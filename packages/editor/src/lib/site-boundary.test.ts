import { describe, expect, test } from 'bun:test'
import type { Mode } from '../store/use-editor'
import { siteBoundaryHandlesEnabled } from './site-boundary'

/**
 * The site handles are the one affordance both views draw from the same state, so
 * they are also the one place a 2D/3D parity break can hide.
 */

const MODES: Mode[] = ['select', 'edit', 'delete', 'build', 'material-paint']
describe('siteBoundaryHandlesEnabled', () => {
  test('the site phase offers them in every mode', () => {
    for (const mode of MODES) {
      expect(siteBoundaryHandlesEnabled({ mode, phase: 'site' })).toBe(true)
    }
  })

  test('select mode offers them outside the site phase', () => {
    // The flags double as the affordance that *enters* site editing, so select mode
    // has to show them from structure/furnish or the lot becomes unreachable.
    expect(siteBoundaryHandlesEnabled({ mode: 'select', phase: 'structure' })).toBe(true)
    expect(siteBoundaryHandlesEnabled({ mode: 'select', phase: 'furnish' })).toBe(true)
  })

  test('a drafting or painting mode outside the site phase hides them', () => {
    for (const mode of ['edit', 'delete', 'build', 'material-paint'] as Mode[]) {
      expect(siteBoundaryHandlesEnabled({ mode, phase: 'structure' })).toBe(false)
      expect(siteBoundaryHandlesEnabled({ mode, phase: 'furnish' })).toBe(false)
    }
  })
})
