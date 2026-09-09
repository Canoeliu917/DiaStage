import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  getMaterialPresetByRef,
  MATERIAL_CATALOG,
  registerLibraryMaterials,
  unregisterLibraryMaterials,
} from '@pascal-app/core'
import { PASCAL_LIBRARY_MATERIALS } from './pascal-library-materials'

test('every bundled material thumbnail and texture is a real local image', () => {
  const urls = new Set(
    [...MATERIAL_CATALOG, ...PASCAL_LIBRARY_MATERIALS]
      .flatMap((item) => [item.previewThumbnailUrl, ...Object.values(item.preset.maps)])
      .filter((url): url is string => typeof url === 'string' && url.startsWith('/material/')),
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

test('the public material snapshot retains both sources and fills wallpaper and other', () => {
  expect(PASCAL_LIBRARY_MATERIALS).toHaveLength(16)
  expect(PASCAL_LIBRARY_MATERIALS.filter((item) => item.source === 'pascal')).toHaveLength(3)
  expect(PASCAL_LIBRARY_MATERIALS.filter((item) => item.source === 'community')).toHaveLength(13)
  expect(PASCAL_LIBRARY_MATERIALS.filter((item) => item.category === 'wallpaper')).toHaveLength(2)
  expect(PASCAL_LIBRARY_MATERIALS.filter((item) => item.category === 'other')).toHaveLength(6)
})

test('saved library references resolve again when the host reloads the public catalog', () => {
  const ids = PASCAL_LIBRARY_MATERIALS.map((item) => item.id)
  registerLibraryMaterials(PASCAL_LIBRARY_MATERIALS)
  try {
    for (const item of PASCAL_LIBRARY_MATERIALS) {
      expect(getMaterialPresetByRef(`library:${item.id}`)).toEqual(item.preset)
    }
  } finally {
    unregisterLibraryMaterials(ids)
  }
})
