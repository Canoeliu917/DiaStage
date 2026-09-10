import { expect, test } from 'bun:test'
import { SCAN_LIMITS, validateScanGlb } from './scan-glb'
import { scanGlb } from './scan-test-fixtures'

const validate = (bytes: Uint8Array, size = bytes.length) =>
  validateScanGlb(async (o, n) => bytes.slice(o, o + n), size)

test('GLB boundary: 32 MiB and 1.5 million vertices accepted, one over rejected', async () => {
  expect((await validate(scanGlb(3, SCAN_LIMITS.bytes))).bytes).toBe(SCAN_LIMITS.bytes)
  expect((await validate(scanGlb(SCAN_LIMITS.vertices))).vertices).toBe(SCAN_LIMITS.vertices)
  await expect(validate(scanGlb(SCAN_LIMITS.vertices + 1))).rejects.toThrow()
  await expect(validate(scanGlb(), SCAN_LIMITS.bytes + 1)).rejects.toThrow()
})

test('malformed GLB headers, chunks, lengths, external resources and unsafe geometry rejected', async () => {
  const valid = scanGlb()
  for (const offset of [0, 4, 8, 12, 16, valid.length - 44]) {
    const bytes = valid.slice()
    new DataView(bytes.buffer).setUint32(offset, 1, true)
    await expect(validate(bytes)).rejects.toThrow()
  }
  await expect(validate(valid.slice(0, -1), valid.length)).rejects.toThrow()
  for (const edit of [
    (j: Record<string, unknown>) => {
      j.buffers = [{ byteLength: 36, uri: 'https://example.invalid/private' }]
    },
    (j: Record<string, unknown>) => {
      j.nodes = [{ mesh: 0, children: [0] }]
    },
    (j: Record<string, unknown>) => {
      j.scenes = [{ nodes: [999] }]
    },
    (j: Record<string, unknown>) => {
      j.extensionsUsed = ['KHR_lights_punctual']
    },
    (j: Record<string, unknown>) => {
      j.accessors = [{ bufferView: 0, componentType: 5126, count: 5000, type: 'VEC3' }]
    },
  ])
    await expect(validate(scanGlb(3, undefined, edit))).rejects.toThrow()
  const nan = valid.slice()
  new DataView(nan.buffer).setFloat32(nan.length - 36, Number.NaN, true)
  await expect(validate(nan)).rejects.toThrow('非法数值')
})
