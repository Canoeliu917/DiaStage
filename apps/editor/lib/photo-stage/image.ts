export type PhotoCrop = 'full' | 'upper' | 'lower' | 'reference'

export function photoCropRect(width: number, height: number, crop: PhotoCrop) {
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0))
    throw new Error('照片尺寸无效。')
  // The supplied composite has unequal panels; its second photograph starts at 60%.
  if (crop === 'reference') return { x: 0, y: height * 0.6, width, height: height * 0.4 }
  const croppedHeight = crop === 'full' ? height : height / 2
  return { x: 0, y: crop === 'lower' ? height / 2 : 0, width, height: croppedHeight }
}

export async function preparePhoto(file: File, crop: PhotoCrop) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('请选择 JPG、PNG 或 WebP 照片。')
  if (file.size > 12 * 1024 * 1024) throw new Error('照片请控制在 12 MB 以内。')
  const bitmap = await createImageBitmap(file)
  try {
    const rect = photoCropRect(bitmap.width, bitmap.height, crop)
    const encode = (longEdge: number, quality: number) => {
      const ratio = Math.min(1, longEdge / Math.max(rect.width, rect.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(rect.width * ratio))
      canvas.height = Math.max(1, Math.round(rect.height * ratio))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('浏览器无法处理照片，请换用支持 Canvas 的浏览器。')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(
        bitmap,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        0,
        0,
        canvas.width,
        canvas.height,
      )
      return canvas.toDataURL('image/jpeg', quality)
    }
    let sourceImage = encode(2048, 0.92)
    if (sourceImage.length > 3_500_000) sourceImage = encode(1600, 0.85)
    if (sourceImage.length > 3_500_000)
      throw new Error('照片细节过多，请先缩小到 1600 像素后重试。')
    let imageDataUrl = encode(1600, 0.82)
    if (imageDataUrl.length > 880_000) imageDataUrl = encode(1280, 0.7)
    if (imageDataUrl.length > 880_000) imageDataUrl = encode(1024, 0.6)
    if (imageDataUrl.length > 880_000) throw new Error('识别图片仍过大，请缩小后重试。')
    return { sourceImage, imageDataUrl }
  } finally {
    bitmap.close()
  }
}
