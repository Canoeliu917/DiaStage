export function scanGlb(
  vertices = 3,
  size?: number,
  edit?: (json: Record<string, unknown>) => void,
): Uint8Array {
  const json: Record<string, unknown> = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: vertices, type: 'VEC3' }],
    bufferViews: [{ buffer: 0, byteLength: vertices * 12 }],
    buffers: [{ byteLength: vertices * 12 }],
  }
  edit?.(json)
  const encode = () =>
    new TextEncoder().encode(
      JSON.stringify(json).padEnd(Math.ceil(JSON.stringify(json).length / 4) * 4, ' '),
    )
  let text = encode()
  if (size) {
    for (let i = 0; i < 3; i++) {
      json.buffers = [{ byteLength: size - text.length - 28 }]
      text = encode()
    }
  }
  const bytes = new Uint8Array(size ?? text.length + 28 + vertices * 12)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, bytes.length, true)
  view.setUint32(12, text.length, true)
  view.setUint32(16, 0x4e4f534a, true)
  bytes.set(text, 20)
  view.setUint32(20 + text.length, bytes.length - text.length - 28, true)
  view.setUint32(24 + text.length, 0x004e4942, true)
  return bytes
}
