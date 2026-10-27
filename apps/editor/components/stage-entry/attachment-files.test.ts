import { expect, test } from 'bun:test'
import { classifyDiaAttachment, scheduleAttachmentParse } from './attachment-files'

test('a single supported attachment selects the existing photo or PDF pipeline', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp'])
    expect(classifyDiaAttachment([new File(['synthetic'], 'stage', { type })]).kind).toBe('photo')
  expect(classifyDiaAttachment([new File(['synthetic'], 'script.PDF')]).kind).toBe('script')
  for (const files of [
    [],
    [new File([], 'empty.pdf')],
    [new File(['x'], 'script.txt')],
    [new File(['x'], 'a.pdf'), new File(['x'], 'b.pdf')],
  ])
    expect(() => classifyDiaAttachment(files)).toThrow()
  expect(() =>
    classifyDiaAttachment([
      new File([new Uint8Array(12 * 1024 * 1024 + 1)], 'stage.png', { type: 'image/png' }),
    ]),
  ).toThrow('12 MB')
  expect(() =>
    classifyDiaAttachment([new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'script.pdf')]),
  ).toThrow('20 MB')
})

test('unmount or StrictMode cleanup cancels the first scheduled parse without paid duplicate work', async () => {
  let calls = 0
  const cancelled = scheduleAttachmentParse(() => {
    calls++
  })
  cancelled()
  await Promise.resolve()
  expect(calls).toBe(0)
  const firstMount = scheduleAttachmentParse(() => {
    calls++
  })
  firstMount()
  scheduleAttachmentParse(() => {
    calls++
  })
  await Promise.resolve()
  expect(calls).toBe(1)
})
