import { expect, test } from 'bun:test'
import {
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
} from 'mediabunny'
import { AUDIO_LIMITS, readAudioUpload, validateAudio } from './audio-validation'
import { transcribeVoice } from './voice-transcriber'

const signal = () => new AbortController().signal

function memoryTarget() {
  const chunks: { data: Uint8Array; position: number }[] = []
  const target = new StreamTarget(
    new WritableStream({
      write(chunk) {
        chunks.push({ data: chunk.data.slice(), position: chunk.position })
      },
    }),
  )
  return {
    target,
    file(name: string, type: string) {
      const bytes = new Uint8Array(
        Math.max(0, ...chunks.map((chunk) => chunk.position + chunk.data.length)),
      )
      for (const chunk of chunks) bytes.set(chunk.data, chunk.position)
      return new File([bytes], name, { type })
    },
  }
}

async function recording(format: 'mp4' | 'webm', seconds = 0.2): Promise<File> {
  const memory = memoryTarget()
  const output = new Output({
    target: memory.target,
    format: format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
  })
  const source = new EncodedAudioPacketSource('opus')
  output.addAudioTrack(source)
  await output.start()
  const packetDuration = seconds > 1 ? 0.12 : 0.02
  const data =
    seconds > 1
      ? new Uint8Array([
          0xfb, 6, 0xff, 0xfe, 0xff, 0xfe, 0xff, 0xfe, 0xff, 0xfe, 0xff, 0xfe, 0xff, 0xfe,
        ])
      : new Uint8Array([0xf8, 0xff, 0xfe])
  const packetCount = Math.ceil(seconds / packetDuration)
  for (let i = 0; i < packetCount; i++) {
    // Valid Opus silence packets (one or six 20 ms frames), muxed into actual containers in memory.
    await source.add(new EncodedPacket(data, 'key', i * packetDuration, packetDuration), {
      decoderConfig: { codec: 'opus', sampleRate: 48000, numberOfChannels: 1 },
    })
  }
  await output.finalize()
  return memory.file(`recording.${format}`, `audio/${format}`)
}

function upload(file: File, fields: Record<string, string> = { locale: 'zh-CN' }): Request {
  const form = new FormData()
  form.append('audio', file)
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return new Request('http://127.0.0.1/api/ai/transcribe', { method: 'POST', body: form })
}

test('real MP4 and WebM audio durations come from audio packets', async () => {
  for (const format of ['mp4', 'webm'] as const) {
    const file = await recording(format)
    const audio = await validateAudio(file, signal())
    expect(audio.durationSeconds).toBeCloseTo(0.2, 4)
    expect(audio.mime).toBe(`audio/${format}`)
    expect(audio.bytes.byteLength).toBe(file.size)
  }
})

test('AAC MediaRecorder-compatible MP4 is accepted without needing a browser decoder', async () => {
  const memory = memoryTarget()
  const output = new Output({ target: memory.target, format: new Mp4OutputFormat() })
  const source = new EncodedAudioPacketSource('aac')
  output.addAudioTrack(source)
  await output.start()
  const duration = 1024 / 44100
  await source.add(
    new EncodedPacket(new Uint8Array([0x21, 0x10, 0x04, 0x60, 0x8c, 0x1c]), 'key', 0, duration),
    {
      decoderConfig: {
        codec: 'mp4a.40.2',
        sampleRate: 44100,
        numberOfChannels: 2,
        description: new Uint8Array([0x12, 0x10]),
      },
    },
  )
  await output.finalize()
  const audio = await validateAudio(
    memory.file('capture.mp4', 'audio/mp4;codecs=mp4a.40.2'),
    signal(),
  )
  expect(audio.durationSeconds).toBeCloseTo(duration, 5)
})

test('overlong audio is rejected even when container duration metadata is falsified', async () => {
  for (const format of ['mp4', 'webm'] as const) {
    const file = await recording(format, 90.2)
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (format === 'webm') {
      let changed = false
      for (let i = 0; i < bytes.length - 11; i++) {
        if (bytes[i] === 0x44 && bytes[i + 1] === 0x89 && bytes[i + 2] === 0x88) {
          new DataView(bytes.buffer).setFloat64(i + 3, 1, false)
          changed = true
          break
        }
      }
      expect(changed).toBe(true)
    } else {
      const name = new TextEncoder().encode('mvhd')
      let changed = false
      for (let i = 0; i < bytes.length - 24; i++) {
        if (name.every((byte, offset) => byte === bytes[i + offset])) {
          expect(bytes[i + 4]).toBe(0)
          new DataView(bytes.buffer).setUint32(i + 20, 1, false)
          changed = true
          break
        }
      }
      expect(changed).toBe(true)
    }
    await expect(
      validateAudio(new File([bytes], file.name, { type: file.type }), signal()),
    ).rejects.toMatchObject({
      code: 'AUDIO_UNSUPPORTED',
      message: '单次录音不能超过 90 秒，请分成两段录制。',
    })
  }
})

test('MIME, codec, size, missing tracks, and corrupt file cannot reach transcription', async () => {
  const webm = await recording('webm')
  for (const file of [
    new File([await webm.arrayBuffer()], 'fake.mp4', { type: 'audio/mp4' }),
    new File([await webm.arrayBuffer()], 'fake.webm', { type: 'audio/webm;codecs=aac' }),
    new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])], 'broken.webm', {
      type: 'audio/webm',
    }),
    new File([], 'empty.webm', { type: 'audio/webm' }),
  ]) {
    let called = false
    await expect(
      transcribeVoice(file, signal(), async () => {
        called = true
        return { text: 'must not happen' }
      }),
    ).rejects.toMatchObject({ code: 'AUDIO_UNSUPPORTED' })
    expect(called).toBe(false)
  }
  await expect(
    validateAudio(
      new File([Buffer.alloc(AUDIO_LIMITS.maxBytes + 1)], 'large.mp4', { type: 'audio/mp4' }),
      signal(),
    ),
  ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  const memory = memoryTarget()
  const output = new Output({ target: memory.target, format: new WebMOutputFormat() })
  const video = new EncodedVideoPacketSource('vp8')
  output.addVideoTrack(video)
  await output.start()
  await video.add(
    new EncodedPacket(new Uint8Array([0x10, 0, 0, 0x9d, 1, 0x2a, 2, 0, 2, 0]), 'key', 0, 0.04),
    {
      decoderConfig: { codec: 'vp8', codedWidth: 2, codedHeight: 2 },
    },
  )
  await output.finalize()
  await expect(
    validateAudio(memory.file('video.webm', 'audio/webm'), signal()),
  ).rejects.toMatchObject({ code: 'AUDIO_UNSUPPORTED' })
})

test('multipart only accepts one bounded audio file and the supported locale', async () => {
  const file = await recording('webm')
  const parsed = await readAudioUpload(upload(file), signal())
  expect(parsed.size).toBe(file.size)
  await expect(readAudioUpload(upload(file, { locale: 'en-US' }), signal())).rejects.toMatchObject({
    code: 'AUDIO_UNSUPPORTED',
  })
  await expect(
    readAudioUpload(upload(file, { locale: 'zh-CN', extra: 'code' }), signal()),
  ).rejects.toMatchObject({ code: 'AUDIO_UNSUPPORTED' })
  await expect(
    readAudioUpload(
      new Request('http://127.0.0.1', {
        method: 'POST',
        body: 'bad',
        headers: { 'content-type': 'multipart/form-data; boundary=missing' },
      }),
      signal(),
    ),
  ).rejects.toMatchObject({ code: 'AUDIO_UNSUPPORTED' })
  const huge = new File([Buffer.alloc(AUDIO_LIMITS.maxBytes + 1)], 'too-large.webm', {
    type: 'audio/webm',
  })
  await expect(readAudioUpload(upload(huge), signal())).rejects.toMatchObject({
    code: 'FILE_TOO_LARGE',
  })
})

test('transcription response is bounded, editable text with measured duration, and failures are safe', async () => {
  const file = await recording('webm')
  const result = await transcribeVoice(file, signal(), async (audio) => {
    expect(audio.mime).toBe('audio/webm')
    return { text: '  舞台宽八米深六米。  ', languages: [{ code: 'zh' }], usage: {} }
  })
  expect(result.transcript).toBe('舞台宽八米深六米。')
  expect(result.language).toBe('zh')
  expect(result.durationSeconds).toBeCloseTo(0.2, 4)
  for (const output of [
    { text: '' },
    { text: '听不清', languages: [] },
    { text: 'x'.repeat(10_001) },
  ])
    await expect(transcribeVoice(file, signal(), async () => output)).rejects.toMatchObject({
      code: 'TRANSCRIPTION_FAILED',
    })
  await expect(
    transcribeVoice(file, signal(), async () => {
      throw new Error('provider secret')
    }),
  ).rejects.toMatchObject({ code: 'TRANSCRIPTION_FAILED', status: 502 })
})

test('cancellation aborts validation and discards an already running transcription', async () => {
  const file = await recording('webm')
  const controller = new AbortController()
  controller.abort()
  await expect(validateAudio(file, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  const active = new AbortController()
  await expect(
    transcribeVoice(file, active.signal, async (_audio, modelSignal) => {
      expect(modelSignal).toBe(active.signal)
      active.abort()
      return { text: 'stale' }
    }),
  ).rejects.toMatchObject({ name: 'AbortError' })
})
