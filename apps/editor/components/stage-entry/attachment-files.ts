export function classifyDiaAttachment(files: readonly File[]) {
  if (files.length !== 1) throw new Error('请一次添加一个图片或 PDF 文件。')
  const file = files[0]!
  if (!file.size) throw new Error('文件为空，请重新选择。')
  if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    if (file.size > 12 * 1024 * 1024) throw new Error('图片不能超过 12 MB，请缩小后重试。')
    return { file, kind: 'photo' as const }
  }
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (file.size > 20 * 1024 * 1024) throw new Error('PDF 不能超过 20 MB，请拆分后重试。')
    return { file, kind: 'script' as const }
  }
  throw new Error('请添加 PNG、JPEG、WebP 舞台照片或文本型 PDF。扫描剧本图片暂不支持 OCR。')
}

export function scheduleAttachmentParse(parse: () => void) {
  let active = true
  queueMicrotask(() => {
    if (active) parse()
  })
  return () => {
    active = false
  }
}
