import { expect, test } from 'bun:test'
import { safeAccountNext } from './account-navigation'

test('account return paths stay on this site', () => {
  for (const input of [
    undefined,
    '',
    'https://example.com',
    '//example.com',
    '/\\example.com',
    '/\n/example.com',
    '/\t/example.com',
    ['/scenes', '//example.com'],
    '/login',
    '/login?next=/login',
  ])
    expect(safeAccountNext(input)).toBe('/scenes')
  expect(safeAccountNext('/scene/abc?workspace=set')).toBe('/scene/abc?workspace=set')
  expect(safeAccountNext('/?entry=manual&lit=1')).toBe('/?entry=manual&lit=1')
})
