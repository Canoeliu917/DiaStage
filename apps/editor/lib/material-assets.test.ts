import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { MATERIAL_CATALOG } from '@pascal-app/core'

test('every bundled material thumbnail and texture is a real local image', () => {
  const urls = new Set(
    MATERIAL_CATALOG.flatMap((item) => [
      item.previewThumbnailUrl,
      ...Object.values(item.preset.maps),
    ]).filter((url): url is string => typeof url === 'string' && url.startsWith('/material/')),
  )

  expect(urls.size).toBeGreaterThan(0)
  for (const url of urls) {
    const bytes = readFileSync(new URL(`../public${url}`, import.meta.url))
    if (url.endsWith('.webp')) {
      expect(bytes.toString('ascii', 0, 4), url).toBe('RIFF')
      expect(bytes.toString('ascii', 8, 12), url).toBe('WEBP')
    } else if (url.endsWith('.ktx2')) {
      expect(bytes.subarray(0, 12).toString('hex'), url).toBe('ab4b5458203230bb0d0a1a0a')
    } else {
      throw new Error(`Unverified material image format: ${url}`)
    }
  }
})

test('the bundled stage material library has no remote or building-only assets', () => {
  for (const item of MATERIAL_CATALOG) {
    expect(['library', 'mine']).toContain(item.source ?? 'library')
    expect(item.category).not.toBe('roofing')
    for (const url of [item.previewThumbnailUrl, ...Object.values(item.preset.maps)]) {
      if (url) expect(url.startsWith('/material/')).toBe(true)
    }
  }
})
