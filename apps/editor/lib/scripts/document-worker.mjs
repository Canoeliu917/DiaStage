import { createRequire } from 'node:module'
import path from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { Unzip, UnzipInflate, zipSync } from 'fflate'

const { bytes, type, limits } = workerData
const fail = (code, message) => {
  throw Object.assign(new Error(message), { code })
}
const corrupt = () =>
  fail('CORRUPT_DOCUMENT', '文档已损坏或结构不受支持，请用 Word/WPS 重新另存后上传。')

function checkedZip(input) {
  let hasEndRecord = false
  for (let index = Math.max(0, input.length - 65_557); index <= input.length - 22; index++) {
    if (
      input[index] === 0x50 &&
      input[index + 1] === 0x4b &&
      input[index + 2] === 5 &&
      input[index + 3] === 6
    ) {
      const commentLength = input[index + 20] | (input[index + 21] << 8)
      if (index + 22 + commentLength === input.length) {
        hasEndRecord = true
        break
      }
    }
  }
  if (!hasEndRecord) corrupt()
  const names = new Set()
  const kept = Object.create(null)
  let expanded = 0
  let completed = 0
  const unzip = new Unzip((file) => {
    const name = file.name
    if (
      !name ||
      name.length > 512 ||
      name.includes('\\') ||
      name.startsWith('/') ||
      name.split('/').includes('..') ||
      names.has(name)
    )
      corrupt()
    names.add(name)
    if (names.size > limits.maxZipEntries)
      fail('FILE_TOO_LARGE', 'Word 文档包含过多附件或内部文件，请精简后上传。')
    if (/vba|activex|embeddings|customui/i.test(name))
      fail('UNSUPPORTED_FILE', '当前不接受宏或嵌入程序，请另存为不含宏的 .docx 后上传。')
    const keep = /(?:\.xml|\.rels)$/i.test(name)
    if (
      file.originalSize > limits.maxExpandedBytes ||
      (keep && file.originalSize > limits.maxXmlBytes)
    )
      fail('FILE_TOO_LARGE', 'Word 文档解压后过大，请移除图片或附件后上传。')
    const chunks = []
    let size = 0
    file.ondata = (error, data, final) => {
      if (error) {
        if (['FILE_TOO_LARGE', 'UNSUPPORTED_FILE', 'CORRUPT_DOCUMENT'].includes(error.code))
          throw error
        corrupt()
      }
      expanded += data.length
      size += data.length
      if (expanded > limits.maxExpandedBytes || (keep && size > limits.maxXmlBytes))
        fail('FILE_TOO_LARGE', 'Word 文档解压后过大，请移除图片或附件后上传。')
      if (keep) chunks.push(data.slice())
      if (final) {
        completed++
        if (keep) {
          const output = new Uint8Array(size)
          let offset = 0
          for (const chunk of chunks) {
            output.set(chunk, offset)
            offset += chunk.length
          }
          const text = new TextDecoder('utf-8', { fatal: true }).decode(output)
          if (/<!DOCTYPE|<!ENTITY/i.test(text))
            fail('CORRUPT_DOCUMENT', '文档含有不支持的 XML 实体定义，请另存为标准 .docx。')
          if (/macroEnabled|vbaProject|application\/vnd\.ms-office\.activeX/i.test(text))
            fail('UNSUPPORTED_FILE', '当前不接受带宏的 Word 文档，请另存为 .docx 后上传。')
          kept[name] = output
        }
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  for (let offset = 0; offset < input.length; offset += 16 * 1024)
    unzip.push(input.subarray(offset, offset + 16 * 1024), offset + 16 * 1024 >= input.length)
  if (
    completed !== names.size ||
    !kept['[Content_Types].xml'] ||
    !kept['word/document.xml'] ||
    !kept['_rels/.rels']
  )
    corrupt()
  const contentTypes = new TextDecoder().decode(kept['[Content_Types].xml'])
  const document = new TextDecoder().decode(kept['word/document.xml'])
  if (
    !contentTypes.includes(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    ) ||
    !/\b(?:\w+:)?document\b/.test(document)
  )
    corrupt()
  // Repack only checked XML: the second ZIP reader cannot follow a conflicting central directory or load binary attachments.
  return Buffer.from(zipSync(kept, { level: 0 }))
}

async function extractDocx() {
  const buffer = checkedZip(bytes)
  const { default: mammoth } = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  if (result.value.length > limits.maxExtractedCharacters)
    fail('FILE_TOO_LARGE', '剧本文字超过 300,000 字，请按部分拆分后上传。')
  const paragraphs = result.value
    .split(/\r?\n\s*\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
  if (paragraphs.length === 0)
    fail('CORRUPT_DOCUMENT', 'Word 文档没有可读取的正文，请选择包含文字的 .docx。')
  return {
    pageCount: null,
    paragraphCount: paragraphs.length,
    passages: paragraphs.map((text, index) => ({
      id: `paragraph-${index + 1}`,
      page: null,
      paragraph: index + 1,
      text,
    })),
  }
}

async function extractPdf() {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const require = createRequire(import.meta.url)
  // PDF.js needs a filesystem directory, while bundled require.resolve returns a module ID.
  const pdfRoot = path.dirname(require.resolve(/* webpackIgnore: true */ 'pdfjs-dist/package.json'))
  const loading = getDocument({
    data: bytes,
    verbosity: 0,
    useWorkerFetch: false,
    useSystemFonts: false,
    useWasm: false,
    disableFontFace: true,
    disableAutoFetch: true,
    disableStream: true,
    stopAtErrors: true,
    enableXfa: false,
    cMapUrl: `${path.join(pdfRoot, 'cmaps').replaceAll('\\', '/')}/`,
    standardFontDataUrl: `${path.join(pdfRoot, 'standard_fonts').replaceAll('\\', '/')}/`,
  })
  try {
    const document = await loading.promise
    if (document.numPages > limits.maxPages)
      fail('FILE_TOO_LARGE', 'PDF 超过 300 页，请按部分拆分后上传。')
    const passages = []
    let characters = 0
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number)
      let text = ''
      const reader = page.streamTextContent().getReader()
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          for (const item of chunk.value.items) {
            if (typeof item.str !== 'string') continue
            text += item.str + (item.hasEOL ? '\n' : ' ')
            characters += item.str.length + 1
            if (characters > limits.maxExtractedCharacters)
              fail('FILE_TOO_LARGE', '剧本文字超过 300,000 字，请按部分拆分后上传。')
          }
        }
      } finally {
        reader.releaseLock()
        page.cleanup()
      }
      if (text.trim())
        passages.push({ id: `page-${number}`, page: number, paragraph: null, text: text.trim() })
    }
    if (passages.reduce((count, passage) => count + passage.text.replace(/\s/g, '').length, 0) < 10)
      fail('SCANNED_PDF', '当前文件没有可读取的文字；扫描版 OCR 将在后续版本支持。')
    return { pageCount: document.numPages, paragraphCount: passages.length, passages }
  } finally {
    await loading.destroy()
  }
}

try {
  const result = type === 'pdf' ? await extractPdf() : await extractDocx()
  parentPort.postMessage({ ok: true, result })
} catch (error) {
  const documentError = [
    'UNSUPPORTED_FILE',
    'FILE_TOO_LARGE',
    'SCANNED_PDF',
    'CORRUPT_DOCUMENT',
  ].includes(error?.code)
  parentPort.postMessage({
    ok: false,
    code: documentError ? error.code : 'CORRUPT_DOCUMENT',
    message:
      error?.name === 'PasswordException'
        ? 'PDF 已加密，请先移除密码后上传。'
        : documentError
          ? error.message
          : '文档无法读取，请重新导出为文本 PDF 或 .docx 后上传。',
  })
}
