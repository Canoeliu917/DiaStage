import { expect, test } from 'bun:test'
import { strToU8, zipSync } from 'fflate'
import { extractDocument, readScriptUpload } from './extract'
import { SCRIPT_LIMITS } from './limits'

const signal = () => new AbortController().signal
const text =
  '建立一个宽8米深6米的镜框式舞台。舞台中区放一个双人沙发，沙发台右30厘米放一块窗景片，窗景片台右紧邻一块门景片。'

function docxFiles(content = text): Record<string, Uint8Array> {
  const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': strToU8(
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${escaped}</w:t></w:r></w:p></w:body></w:document>`,
    ),
  }
}

function docx(files = docxFiles()): File {
  return new File([zipSync(files)], 'sample.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

function pdf(content = text, pages = 1, encrypted = false): File {
  const hex = Array.from(content)
    .map((character) => character.charCodeAt(0).toString(16).padStart(4, '0'))
    .join('')
  const cmap =
    '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /IdentityUCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange 1 beginbfrange <0000> <FFFF> <0000> endbfrange endcmap CMapName currentdict /CMap defineresource pop end end'
  const stream = content ? `BT /F1 10 Tf 20 700 Td <${hex}> Tj ET` : ''
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, index) => `${8 + index} 0 R`).join(' ')}] /Count ${pages} >>`,
    '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 5 0 R >>',
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 >>',
    `<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< >>',
    ...Array.from(
      { length: pages },
      () =>
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10000 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 6 0 R >>',
    ),
  ]
  if (encrypted)
    objects.push(
      `<< /Filter /Standard /V 1 /R 2 /Length 40 /O <${'00'.repeat(32)}> /U <${'00'.repeat(32)}> /P -4 >>`,
    )
  let output = '%PDF-1.7\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index++) {
    offsets.push(output.length)
    output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xref = output.length
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join(
      '',
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${encrypted ? `/Encrypt ${objects.length} 0 R /ID [<${'00'.repeat(16)}><${'00'.repeat(16)}>]` : ''} >>\nstartxref\n${xref}\n%%EOF`
  return new File([output], 'sample.pdf', { type: 'application/pdf' })
}

test('extracts real Chinese PDF and DOCX with page or paragraph evidence', async () => {
  const word = await extractDocument(docx(), signal())
  expect(word.file).toMatchObject({
    name: 'sample.docx',
    type: 'docx',
    pageCount: null,
    paragraphCount: 1,
  })
  expect(word.passages[0]).toEqual({ id: 'paragraph-1', page: null, paragraph: 1, text })
  const document = await extractDocument(pdf(), signal())
  expect(document.file).toMatchObject({ name: 'sample.pdf', type: 'pdf', pageCount: 1 })
  expect(document.passages[0]?.text.replace(/\s/g, '')).toBe(text)
  expect(document.passages[0]?.page).toBe(1)
})

test('legacy DOC, bad magic, macro packages, invalid ZIP structure and XML entities fail clearly', async () => {
  await expect(
    extractDocument(
      new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])], 'old.doc'),
      signal(),
    ),
  ).rejects.toMatchObject({
    code: 'UNSUPPORTED_FILE',
    message: '请在 Word/WPS 中另存为 .docx 后上传。',
  })
  await expect(extractDocument(new File(['wrong'], 'fake.pdf'), signal())).rejects.toMatchObject({
    code: 'CORRUPT_DOCUMENT',
  })
  await expect(
    extractDocument(docx({ 'random.txt': strToU8('not Word') }), signal()),
  ).rejects.toMatchObject({ code: 'CORRUPT_DOCUMENT' })
  await expect(
    extractDocument(docx({ ...docxFiles(), 'word/vbaProject.bin': new Uint8Array([1]) }), signal()),
  ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE' })
  const entity = docxFiles()
  entity['word/document.xml'] = strToU8(
    '<!DOCTYPE word [<!ENTITY x SYSTEM "file:///private">]><document>&x;</document>',
  )
  await expect(extractDocument(docx(entity), signal())).rejects.toMatchObject({
    code: 'CORRUPT_DOCUMENT',
  })
  const truncated = new Uint8Array(await docx().arrayBuffer()).slice(0, -20)
  await expect(
    extractDocument(new File([truncated], 'broken.docx'), signal()),
  ).rejects.toMatchObject({ code: 'CORRUPT_DOCUMENT' })
})

test('blank scanned PDF and too many pages are rejected instead of yielding an empty stage', async () => {
  await expect(extractDocument(pdf(''), signal())).rejects.toMatchObject({ code: 'SCANNED_PDF' })
  await expect(
    extractDocument(pdf(text, SCRIPT_LIMITS.maxPages + 1), signal()),
  ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  await expect(extractDocument(pdf(text, 1, true), signal())).rejects.toMatchObject({
    code: 'CORRUPT_DOCUMENT',
    message: 'PDF 已加密，请先移除密码后上传。',
  })
  await expect(
    extractDocument(new File(['%PDF-1.7\ntruncated'], 'broken.pdf'), signal()),
  ).rejects.toMatchObject({ code: 'CORRUPT_DOCUMENT' })
})

test('file bytes, extracted characters, ZIP entry count and actual inflation are bounded', async () => {
  await expect(
    extractDocument(new File([Buffer.alloc(SCRIPT_LIMITS.maxBytes + 1)], 'large.pdf'), signal()),
  ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  await expect(
    extractDocument(
      docx(docxFiles('字'.repeat(SCRIPT_LIMITS.maxExtractedCharacters + 1))),
      signal(),
    ),
  ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  const entries = docxFiles()
  for (let index = 0; index < SCRIPT_LIMITS.maxZipEntries; index++)
    entries[`empty-${index}.txt`] = new Uint8Array()
  await expect(extractDocument(docx(entries), signal())).rejects.toMatchObject({
    code: 'FILE_TOO_LARGE',
  })
  const bomb = docxFiles()
  bomb['word/oversized.xml'] = new Uint8Array(SCRIPT_LIMITS.maxXmlBytes + 1).fill(32)
  const zipped = zipSync(bomb, { level: 9 })
  // Lie about original sizes in local and central records; the streaming expansion cap still applies.
  const view = new DataView(zipped.buffer)
  for (let index = 0; index < zipped.length - 28; index++) {
    if (view.getUint32(index, true) === 0x04034b50) view.setUint32(index + 22, 1, true)
    if (view.getUint32(index, true) === 0x02014b50) view.setUint32(index + 24, 1, true)
  }
  await expect(extractDocument(new File([zipped], 'bomb.docx'), signal())).rejects.toMatchObject({
    code: 'FILE_TOO_LARGE',
  })
})

test('external relationships never load URLs and remain plain text, with cancellation supported', async () => {
  const files = docxFiles('<b>纯文本，不渲染HTML</b>')
  files['word/_rels/document.xml.rels'] = strToU8(
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://unreachable.invalid/" TargetMode="External"/></Relationships>',
  )
  const document = await extractDocument(docx(files), signal())
  expect(document.passages[0]?.text).toBe('<b>纯文本，不渲染HTML</b>')
  const controller = new AbortController()
  const extraction = extractDocument(pdf(), controller.signal)
  controller.abort()
  await expect(extraction).rejects.toMatchObject({ name: 'AbortError' })
})

test('multipart rejects extra or duplicate files and parses bounded optional scene context', async () => {
  const form = new FormData()
  form.append('file', docx())
  form.append(
    'sceneContext',
    JSON.stringify({ documentVersion: 1, venue: null, objects: [], selectedObjectIds: [] }),
  )
  const request = () =>
    new Request('http://127.0.0.1/api/script/stage-plan', { method: 'POST', body: form })
  const parsed = await readScriptUpload(request(), signal())
  expect(parsed.options.sceneContext?.documentVersion).toBe(1)
  form.append('file', pdf())
  await expect(readScriptUpload(request(), signal())).rejects.toMatchObject({
    code: 'UNSUPPORTED_FILE',
  })
  form.delete('file')
  form.set('file', docx())
  form.set('sceneContext', JSON.stringify({ nodes: {} }))
  await expect(readScriptUpload(request(), signal())).rejects.toMatchObject({
    code: 'PLAN_INVALID',
  })
})

test('active parser workers can be cancelled and release the concurrency allowance', async () => {
  const controller = new AbortController()
  const first = extractDocument(pdf(text, 300), controller.signal)
  const second = extractDocument(pdf(text, 300), controller.signal)
  const firstResult = first.then(
    () => null,
    (error: unknown) => error,
  )
  const secondResult = second.then(
    () => null,
    (error: unknown) => error,
  )
  await expect(extractDocument(pdf(), signal())).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  controller.abort()
  expect(await firstResult).toMatchObject({ name: 'AbortError' })
  expect(await secondResult).toMatchObject({ name: 'AbortError' })
  expect((await extractDocument(docx(), signal())).file.type).toBe('docx')
})
