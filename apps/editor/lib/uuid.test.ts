import { afterEach, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Glob } from 'bun'
import { createManualStageGraph } from './stage/initial-stage'
import { createTheatreSceneGraph } from './theatre/new-production'
import { THEATRE_METADATA_KEY } from './theatre/scene-adapter'
import { theatreId } from './theatre/schema'
import { StageSceneDocumentSchema } from './theatre/simulation'
import { createUUID } from './uuid'

const originalCrypto = globalThis.crypto
const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')!
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const fallbackCrypto = {
  getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
}
function setCrypto(value: unknown) {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value })
}
afterEach(() => Object.defineProperty(globalThis, 'crypto', originalDescriptor))

test('native UUID is preferred and called with its crypto receiver', () => {
  let calls = 0
  const native = {
    randomUUID() {
      expect(this).toBe(native)
      calls++
      return '12345678-1234-4234-8234-123456789abc'
    },
    getRandomValues() {
      throw new Error('Native path must not use fallback')
    },
  }
  setCrypto(native)
  expect(createUUID()).toBe('12345678-1234-4234-8234-123456789abc')
  expect(calls).toBe(1)
})

test('missing native UUID uses secure bytes with correct version and variant bits', () => {
  for (const [byte, expected] of [
    [0, '00000000-0000-4000-8000-000000000000'],
    [255, 'ffffffff-ffff-4fff-bfff-ffffffffffff'],
  ] as const) {
    let calls = 0
    const fallback = {
      getRandomValues(bytes: Uint8Array) {
        expect(this).toBe(fallback)
        expect(bytes.length).toBe(16)
        calls++
        return bytes.fill(byte)
      },
    }
    setCrypto(fallback)
    const id = createUUID()
    expect(id).toBe(expected)
    expect(id).toMatch(uuidV4)
    expect(calls).toBe(1)
  }
})

test('10,000 secure fallback IDs have valid UUID v4 format and no duplicates', () => {
  setCrypto(fallbackCrypto)
  const ids = Array.from({ length: 10_000 }, () => createUUID())
  expect(ids.every((id) => uuidV4.test(id))).toBe(true)
  expect(new Set(ids).size).toBe(ids.length)
})

test('missing secure randomness fails closed with a clear error', () => {
  for (const unavailable of [undefined, {}]) {
    setCrypto(unavailable)
    expect(createUUID).toThrow('无法生成安全 UUID：当前环境缺少 crypto.getRandomValues。')
  }
})

test('a failing secure random source is not replaced by weaker randomness', () => {
  setCrypto({
    getRandomValues() {
      throw new Error('Secure entropy unavailable')
    },
  })
  expect(createUUID).toThrow('Secure entropy unavailable')
})

test('Desktop native and HTTP LAN fallback both create client scene graphs', () => {
  for (const crypto of [originalCrypto, fallbackCrypto]) {
    setCrypto(crypto)
    const graphs = [
      createTheatreSceneGraph('UUID QA only'),
      createManualStageGraph({
        type: 'black-box',
        widthMeters: 8,
        depthMeters: 6,
        heightMeters: 4,
      }),
    ]
    for (const graph of graphs) {
      const site = graph.nodes[graph.rootNodeIds[0]!]!
      const document = StageSceneDocumentSchema.parse(site.metadata[THEATRE_METADATA_KEY])
      expect(document.production.id).toMatch(uuidV4)
      expect(document.venue.id).toMatch(uuidV4)
      expect(document.production.id).not.toBe(document.venue.id)
    }
    expect(theatreId('role')).toMatch(/^role_[0-9a-f-]{36}$/)
  }
})

test('client scene creation fails before persistence when secure crypto is missing', () => {
  setCrypto(undefined)
  expect(() => createTheatreSceneGraph()).toThrow('无法生成安全 UUID')
})

test('browser-facing modules use the helper; only audited server modules keep native UUID', () => {
  const serverOnly = new Set([
    'lib/ai/api.ts',
    'lib/ai/usage.ts',
    'lib/ai/creation-permission.ts',
    'lib/remote-voice/session-store.ts',
    'lib/rehearsal-intelligence/real-eval.ts',
  ])
  const root = new URL('../', import.meta.url)
  for (const file of new Glob('{lib,components}/**/*.{ts,tsx}').scanSync(fileURLToPath(root))) {
    const path = file.replaceAll('\\', '/')
    if (path.includes('.test.') || path === 'lib/uuid.ts' || serverOnly.has(path)) continue
    expect(readFileSync(new URL(path, root), 'utf8')).not.toMatch(/\brandomUUID\s*\(/)
  }
  expect(readFileSync(new URL('./uuid.ts', import.meta.url), 'utf8')).not.toContain('Math.random')
})
