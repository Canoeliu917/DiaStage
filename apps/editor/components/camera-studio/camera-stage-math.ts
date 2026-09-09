import type { CameraPose, Vec3 } from './model'

export function transformedCameraPose(
  original: CameraPose,
  position: Vec3,
  forward: Vec3,
  mode: 'translate' | 'rotate',
): CameraPose {
  if (![...position, ...forward].every(Number.isFinite)) throw new Error('摄像机变换须为有限数值')
  if (mode === 'translate') {
    return {
      ...original,
      position,
      lookAt: original.lookAt.map((v, i) => v + position[i]! - original.position[i]!) as Vec3,
    }
  }
  const length = Math.hypot(...forward)
  if (length < 0.0001) throw new Error('摄像机朝向不可为零')
  const distance = Math.hypot(...original.lookAt.map((v, i) => v - original.position[i]!))
  return {
    ...original,
    position,
    lookAt: position.map((v, i) => v + (forward[i]! / length) * distance) as Vec3,
  }
}

export function unpackMonitorPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  webgpu: boolean,
): Uint8ClampedArray<ArrayBuffer> {
  const rowBytes = width * 4
  const padded = Math.ceil(rowBytes / 256) * 256
  const stride = webgpu && pixels.length >= padded * height ? padded : rowBytes
  if (pixels.length < stride * height) throw new Error('监看像素缓冲区不完整')
  const output = new Uint8ClampedArray(rowBytes * height)
  for (let row = 0; row < height; row++) {
    const source = (webgpu ? row : height - 1 - row) * stride
    output.set(pixels.subarray(source, source + rowBytes), row * rowBytes)
  }
  return output
}
