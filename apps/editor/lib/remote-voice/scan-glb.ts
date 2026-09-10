import { z } from 'zod'

export const SCAN_LIMITS = {
  bytes: 32 * 1024 * 1024,
  vertices: 1_500_000,
  jsonBytes: 2 * 1024 * 1024,
  ttlMs: 10 * 60_000,
  uploadMs: 120_000,
  concurrent: 4,
  temporaryBytes: 128 * 1024 * 1024,
} as const

export const ScanInfoSchema = z.strictObject({
  bytes: z.number().int().positive().max(SCAN_LIMITS.bytes),
  vertices: z.number().int().positive().max(SCAN_LIMITS.vertices),
})
export type ScanInfo = z.infer<typeof ScanInfoSchema>
export const ScanUploadSchema = z.strictObject({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  sceneId: z.string().min(1),
  name: z.string().min(1).max(160),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(SCAN_LIMITS.bytes),
  vertices: z.number().int().nonnegative().max(SCAN_LIMITS.vertices),
  state: z.enum(['uploading', 'ready', 'imported', 'rejected', 'failed']),
  expiresAt: z.number().finite(),
  error: z.string().nullable(),
})
export type ScanUpload = z.infer<typeof ScanUploadSchema>
const integer = z.number().int().nonnegative()
const gltfSchema = z.object({
  asset: z.object({ version: z.literal('2.0') }),
  buffers: z.array(z.object({ byteLength: integer })).length(1),
  bufferViews: z
    .array(
      z.object({
        buffer: z.literal(0),
        byteOffset: integer.default(0),
        byteLength: integer,
        byteStride: integer.optional(),
      }),
    )
    .max(20_000),
  accessors: z
    .array(
      z.object({
        bufferView: integer,
        byteOffset: integer.default(0),
        componentType: z.number(),
        count: integer,
        type: z.string(),
        sparse: z.never().optional(),
      }),
    )
    .max(20_000),
  meshes: z
    .array(
      z.object({
        primitives: z
          .array(
            z.object({
              attributes: z.record(z.string(), integer),
              indices: integer.optional(),
              mode: z.literal(4).optional(),
            }),
          )
          .max(20_000),
      }),
    )
    .max(10_000),
  nodes: z
    .array(
      z.object({
        mesh: integer.optional(),
        children: z.array(integer).default([]),
        matrix: z.array(z.number().finite()).length(16).optional(),
        translation: z.array(z.number().finite()).length(3).optional(),
        rotation: z.array(z.number().finite()).length(4).optional(),
        scale: z.array(z.number().finite()).length(3).optional(),
      }),
    )
    .max(20_000),
  scenes: z
    .array(z.object({ nodes: z.array(integer) }))
    .min(1)
    .max(100),
  scene: integer.default(0),
  images: z
    .array(z.object({ bufferView: integer, mimeType: z.enum(['image/png', 'image/jpeg']) }))
    .max(64)
    .default([]),
})

/** Reads only headers, bounded JSON and image headers; the server need not buffer the GLB. */
export async function validateScanGlb(
  read: (offset: number, length: number) => Promise<Uint8Array>,
  size: number,
): Promise<ScanInfo> {
  const fail = (message: string): never => {
    throw new Error(message)
  }
  if (!Number.isSafeInteger(size) || size < 28 || size > SCAN_LIMITS.bytes)
    fail('扫描文件必须是 32MB 以内的单文件 GLB。')
  const exact = async (offset: number, length: number) => {
    const bytes = await read(offset, length)
    if (bytes.length !== length) fail('扫描文件被截断，请重新导出或上传。')
    return bytes
  }
  const header = await exact(0, 20)
  const h = new DataView(header.buffer, header.byteOffset, header.byteLength)
  if (
    h.getUint32(0, true) !== 0x46546c67 ||
    h.getUint32(4, true) !== 2 ||
    h.getUint32(8, true) !== size
  )
    fail('GLB 标识、版本或声明长度不正确。')
  const jsonLength = h.getUint32(12, true)
  if (
    h.getUint32(16, true) !== 0x4e4f534a ||
    jsonLength % 4 ||
    jsonLength > SCAN_LIMITS.jsonBytes ||
    jsonLength + 28 > size
  )
    fail('GLB JSON 分块无效或过大。')
  const json: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(await exact(20, jsonLength)),
  )
  const inspect = (value: unknown, depth = 0) => {
    if (depth > 100) fail('扫描文件结构过深。')
    if (typeof value === 'number' && !Number.isFinite(value)) fail('扫描文件含非法数值。')
    if (Array.isArray(value)) {
      for (const child of value) inspect(child, depth + 1)
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key === 'uri') fail('扫描必须把网格和贴图嵌入 GLB，不能引用外部资源。')
        if (
          key === 'extensions' ||
          key === 'extensionsRequired' ||
          key === 'extensionsUsed' ||
          key === 'animations' ||
          key === 'skins'
        ) {
          if (child && Object.keys(child).length)
            fail('扫描暂不接受扩展、压缩网格、灯光或动画，请导出普通静态 GLB。')
        }
        inspect(child, depth + 1)
      }
    }
  }
  inspect(json)
  const parsed = gltfSchema.safeParse(json)
  if (!parsed.success) fail('扫描缺少有效的静态网格、节点或内嵌贴图数据。')
  const gltf = parsed.data!
  const binHeader = await exact(20 + jsonLength, 8)
  const b = new DataView(binHeader.buffer, binHeader.byteOffset, 8)
  const binLength = b.getUint32(0, true),
    binOffset = 28 + jsonLength
  if (
    b.getUint32(4, true) !== 0x004e4942 ||
    binLength % 4 ||
    binOffset + binLength !== size ||
    gltf.buffers[0]!.byteLength > binLength ||
    binLength - gltf.buffers[0]!.byteLength > 3
  )
    fail('GLB 二进制分块或缓冲长度不正确。')
  for (const view of gltf.bufferViews)
    if (view.byteOffset + view.byteLength > gltf.buffers[0]!.byteLength)
      fail('扫描缓冲区超出文件范围。')
  const components: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
  const widths: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
  for (const accessor of gltf.accessors) {
    const view = gltf.bufferViews[accessor.bufferView]
    const packed = (components[accessor.type] ?? 0) * (widths[accessor.componentType] ?? 0)
    const stride = view?.byteStride ?? packed
    if (
      !view ||
      !packed ||
      stride < packed ||
      stride > 252 ||
      accessor.byteOffset +
        Math.max(0, accessor.count - 1) * stride +
        (accessor.count ? packed : 0) >
        view.byteLength
    )
      fail('扫描网格数据范围或顶点数不正确。')
  }
  const meshVertices = gltf.meshes.map((mesh) =>
    mesh.primitives.reduce((sum, primitive) => {
      const position = gltf.accessors[primitive.attributes.POSITION ?? -1]
      if (position?.type !== 'VEC3' || position.componentType !== 5126)
        fail('扫描网格缺少浮点三维顶点。')
      for (const index of [
        ...Object.values(primitive.attributes),
        ...(primitive.indices === undefined ? [] : [primitive.indices]),
      ])
        if (!gltf.accessors[index]) fail('扫描索引引用无效。')
      if (primitive.indices !== undefined) {
        const indices = gltf.accessors[primitive.indices]!
        if (indices.type !== 'SCALAR' || ![5121, 5123, 5125].includes(indices.componentType))
          fail('扫描三角面索引无效。')
      }
      return sum + position!.count
    }, 0),
  )
  const parents = new Set<number>(),
    visiting = new Set<number>(),
    visited = new Set<number>()
  const visit = (index: number, depth: number) => {
    if (!gltf.nodes[index] || depth > 512 || visiting.has(index))
      fail('扫描节点存在循环或无效引用。')
    if (visited.has(index)) return
    visiting.add(index)
    for (const child of gltf.nodes[index]!.children) {
      if (parents.has(child)) fail('扫描节点不能被重复挂载。')
      parents.add(child)
      visit(child, depth + 1)
    }
    visiting.delete(index)
    visited.add(index)
  }
  let vertices = 0
  gltf.nodes.forEach((node, index) => {
    visit(index, 0)
    if (node.mesh !== undefined) {
      if (meshVertices[node.mesh] === undefined) fail('扫描网格引用无效。')
      vertices += meshVertices[node.mesh]!
    }
  })
  if (!gltf.scenes[gltf.scene]) fail('扫描默认场景不存在。')
  for (const scene of gltf.scenes)
    for (const index of scene.nodes)
      if (!gltf.nodes[index] || parents.has(index)) fail('扫描场景根节点无效。')
  ScanInfoSchema.parse({ bytes: size, vertices })
  for (const accessor of gltf.accessors) {
    if (accessor.componentType !== 5126) continue
    const view = gltf.bufferViews[accessor.bufferView]!
    const count = components[accessor.type]!,
      stride = view.byteStride ?? count * 4
    const batch = Math.max(1, Math.floor(65_536 / stride))
    for (let start = 0; start < accessor.count; start += batch) {
      const n = Math.min(batch, accessor.count - start)
      const bytes = await exact(
        binOffset + view.byteOffset + accessor.byteOffset + start * stride,
        (n - 1) * stride + count * 4,
      )
      const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      for (let i = 0; i < n; i++)
        for (let j = 0; j < count; j++)
          if (!Number.isFinite(data.getFloat32(i * stride + j * 4, true)))
            fail('扫描网格含非法数值。')
    }
  }
  let pixels = 0
  for (const image of gltf.images) {
    const view = gltf.bufferViews[image.bufferView]
    if (!view) fail('扫描贴图引用无效。')
    const bytes = await exact(binOffset + view!.byteOffset, Math.min(view!.byteLength, 65_536))
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let width = 0,
      height = 0
    if (
      image.mimeType === 'image/png' &&
      bytes.length >= 24 &&
      data.getUint32(0) === 0x89504e47 &&
      data.getUint32(4) === 0x0d0a1a0a &&
      data.getUint32(12) === 0x49484452
    ) {
      width = data.getUint32(16)
      height = data.getUint32(20)
    } else if (image.mimeType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) {
      for (let i = 2; i + 8 < bytes.length; ) {
        if (bytes[i] !== 0xff) break
        const marker = bytes[i + 1]!,
          length = data.getUint16(i + 2)
        if ([0xc0, 0xc1, 0xc2].includes(marker)) {
          height = data.getUint16(i + 5)
          width = data.getUint16(i + 7)
          break
        }
        if (length < 2) break
        i += length + 2
      }
    }
    pixels += width * height
    if (!width || !height || width > 4096 || height > 4096 || pixels > 32 * 1024 * 1024)
      fail('扫描贴图无效或过大，请压缩为 4096 像素以内的 PNG/JPEG。')
  }
  return ScanInfoSchema.parse({ bytes: size, vertices })
}
