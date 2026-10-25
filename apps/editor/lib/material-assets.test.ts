import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext, Script } from 'node:vm'
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

test('bundled geometry and texture decoders contain valid JavaScript and WebAssembly', async () => {
  for (const decoder of [
    'basis/basis_transcoder',
    'draco/draco_decoder',
    'draco/draco_wasm_wrapper',
  ]) {
    const javascript = readFileSync(
      new URL(`../public/decoders/${decoder}.js`, import.meta.url),
      'utf8',
    )
    expect(() => new Script(javascript)).not.toThrow()
  }
  for (const decoder of ['basis/basis_transcoder', 'draco/draco_decoder']) {
    const wasm = readFileSync(new URL(`../public/decoders/${decoder}.wasm`, import.meta.url))
    expect(await WebAssembly.compile(wasm)).toBeInstanceOf(WebAssembly.Module)
  }
})

test('bundled Basis decoder transcodes a real stage material without network access', async () => {
  const javascript = readFileSync(
    new URL('../public/decoders/basis/basis_transcoder.js', import.meta.url),
    'utf8',
  )
  const createBasis = runInNewContext(`${javascript}\nBASIS`, { console, WebAssembly, TextDecoder })
  const basis = await createBasis({
    wasmBinary: readFileSync(
      new URL('../public/decoders/basis/basis_transcoder.wasm', import.meta.url),
    ),
  })
  basis.initializeBasis()
  const bytes = readFileSync(
    new URL(
      '../public/material/wood/floor_plank_1/floor_plank_1_basecolor_512.ktx2',
      import.meta.url,
    ),
  )
  const texture = new basis.KTX2File(bytes)
  try {
    expect(texture.isValid()).toBe(true)
    expect(texture.getWidth()).toBe(512)
    expect(texture.startTranscoding()).toBeTruthy()
    const rgba = new Uint8Array(texture.getImageTranscodedSizeInBytes(0, 0, 0, 13))
    expect(texture.transcodeImage(rgba, 0, 0, 0, 13, 0, -1, -1)).toBeTruthy()
    expect(rgba.length).toBe(512 * 512 * 4)
    expect(rgba.some((value) => value !== 0)).toBe(true)
  } finally {
    texture.close()
    texture.delete()
  }
})
