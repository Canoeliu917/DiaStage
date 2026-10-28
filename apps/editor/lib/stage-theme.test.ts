import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { resolveStageTheme, STAGE_THEME_BOOTSTRAP, stageThemePreference } from './stage-theme'

describe('stage appearance preferences', () => {
  test('explicit choices override the system; missing and invalid choices follow it', () => {
    for (const stored of [null, '', 'system', 'unexpected']) {
      expect(resolveStageTheme(stageThemePreference(stored), true)).toBe('night')
      expect(resolveStageTheme(stageThemePreference(stored), false)).toBe('day')
    }
    expect(resolveStageTheme(stageThemePreference('day'), true)).toBe('day')
    expect(resolveStageTheme(stageThemePreference('night'), false)).toBe('night')
  })

  test('the pre-hydration theme agrees with runtime resolution even when storage is blocked', () => {
    for (const stored of [null, 'day', 'night', 'system', 'unexpected', 'blocked']) {
      for (const dark of [true, false]) {
        const classes = new Set<string>()
        const document = {
          documentElement: {
            dataset: {} as Record<string, string>,
            classList: {
              toggle: (name: string, enabled: boolean) =>
                enabled ? classes.add(name) : classes.delete(name),
            },
          },
        }
        runInNewContext(STAGE_THEME_BOOTSTRAP, {
          document,
          matchMedia: () => ({ matches: dark }),
          localStorage: {
            getItem: () => {
              if (stored === 'blocked') throw new Error('Storage unavailable')
              return stored
            },
          },
        })
        expect(document.documentElement.dataset.stageTheme).toBe(
          resolveStageTheme(stageThemePreference(stored), dark),
        )
        expect(classes.has('dark')).toBe(document.documentElement.dataset.stageTheme === 'night')
      }
    }
  })
})

function luminance(hex: string) {
  const channels = hex.match(/[\da-f]{2}/g)!.map((value) => {
    const channel = Number.parseInt(value, 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}

function contrast(a: string, b: string) {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y)
  return (high! + 0.05) / (low! + 0.05)
}

test('day and night text, placeholder, action and control tokens meet the contrast floor', () => {
  const css = readFileSync(new URL('../app/stage-theme.css', import.meta.url), 'utf8')
  for (const selector of [':root', 'html[data-stage-theme="night"]']) {
    const block = css.slice(css.indexOf(selector)).split('}')[0]!
    const tokens = Object.fromEntries(
      Array.from(block.matchAll(/--dia-([\w-]+):\s*(#[\da-f]{6});/g), (match) => [
        match[1],
        match[2],
      ]),
    )
    for (const surface of ['surface', 'panel', 'raised', 'hover']) {
      expect(contrast(tokens.text!, tokens[surface]!)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokens.muted!, tokens[surface]!)).toBeGreaterThanOrEqual(4.5)
    }
    for (const surface of ['surface', 'panel', 'raised']) {
      expect(contrast(tokens.border!, tokens[surface]!)).toBeGreaterThanOrEqual(3)
    }
    expect(contrast(tokens['on-active']!, tokens.active!)).toBeGreaterThanOrEqual(4.5)
  }
})
