import { afterEach, beforeEach, expect, test } from 'bun:test'
import {
  microphoneError,
  preferredAudioType,
  RECORDING_LIMITS,
  type RecordingResult,
  startVoiceRecording,
} from './recording-session'

class Track extends EventTarget {
  ended = false
  stopCalls = 0
  stop() {
    if (!this.ended) {
      this.ended = true
      this.stopCalls++
      this.dispatchEvent(new Event('ended'))
    }
  }
}
class Stream {
  track = new Track()
  getTracks() {
    return [this.track]
  }
}
class Page extends EventTarget {
  hidden = false
}
class Recorder {
  static supported = new Set(['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'])
  static current: Recorder
  static failStart = false
  static isTypeSupported(type: string) {
    return Recorder.supported.has(type)
  }
  state = 'inactive'
  mimeType: string
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(_stream: Stream, options: MediaRecorderOptions) {
    this.mimeType = options.mimeType!
    Recorder.current = this
  }
  start() {
    if (Recorder.failStart) throw new Error('录音器启动失败')
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(['final'], { type: this.mimeType }) })
      this.onstop?.()
    })
  }
  emit(data: Blob) {
    this.ondataavailable?.({ data })
  }
}

const saved = new Map<string, PropertyDescriptor | undefined>()
let stream: Stream, page: Page, now: number, tick: () => void, cleared: number, requests: number
let results: RecordingResult[], errors: string[]
function replace(key: string, value: unknown) {
  if (!saved.has(key)) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
}
const originalNow = Object.getOwnPropertyDescriptor(performance, 'now')

beforeEach(() => {
  stream = new Stream()
  page = new Page()
  now = 0
  cleared = 0
  requests = 0
  results = []
  errors = []
  Recorder.supported = new Set(['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'])
  Recorder.failStart = false
  replace('isSecureContext', true)
  replace('navigator', {
    mediaDevices: {
      getUserMedia: async () => {
        requests++
        return stream
      },
    },
  })
  replace('document', page)
  replace('MediaRecorder', Recorder)
  replace('AudioContext', undefined)
  replace('setInterval', (callback: () => void) => {
    tick = callback
    return 1
  })
  replace('clearInterval', () => {
    cleared++
  })
  Object.defineProperty(performance, 'now', { configurable: true, value: () => now })
})
afterEach(() => {
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
  saved.clear()
  if (originalNow) Object.defineProperty(performance, 'now', originalNow)
  else Reflect.deleteProperty(performance, 'now')
})
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve))
const start = (controller = new AbortController()) =>
  startVoiceRecording(
    controller.signal,
    () => {},
    (result) => results.push(result),
    (message) => errors.push(message),
  )

test('format selection follows device support instead of assuming iPhone WebM', () => {
  expect(preferredAudioType(Recorder)).toBe('audio/mp4')
  Recorder.supported.delete('audio/mp4')
  expect(preferredAudioType(Recorder)).toBe('audio/webm;codecs=opus')
  Recorder.supported.clear()
  expect(preferredAudioType(Recorder)).toBeNull()
  expect(requests).toBe(0)
})

test('normal stop releases hardware immediately and includes the final audio event', async () => {
  const session = await start()
  Recorder.current.emit(new Blob(['first'], { type: 'audio/mp4' }))
  now = 1500
  session.stop()
  expect(stream.track.stopCalls).toBe(1)
  expect(results).toHaveLength(0)
  await flush()
  expect(results).toHaveLength(1)
  expect(await results[0]!.audio.text()).toBe('firstfinal')
  expect(results[0]!.durationSeconds).toBe(1.5)
  expect(results[0]!.interrupted).toBe(false)
  expect(cleared).toBeGreaterThan(0)
})

test('cancelling while browser permission is pending releases a late stream', async () => {
  let allow: (stream: Stream) => void = () => {}
  replace('navigator', {
    mediaDevices: {
      getUserMedia: () =>
        new Promise<Stream>((resolve) => {
          allow = resolve
        }),
    },
  })
  const controller = new AbortController()
  const pending = start(controller)
  controller.abort()
  allow(stream)
  await expect(pending).rejects.toThrow('录音已取消')
  expect(stream.track.stopCalls).toBe(1)
  expect(results).toEqual([])
})

test('unmount/discard clears chunks and suppresses late complete callbacks', async () => {
  const controller = new AbortController()
  const session = await start(controller)
  Recorder.current.emit(new Blob(['speech']))
  controller.abort()
  session.dispose()
  await flush()
  expect(stream.track.stopCalls).toBe(1)
  expect(results).toEqual([])
  expect(errors).toEqual([])
})

test('background interruption preserves collected audio and asks for explicit transcription', async () => {
  await start()
  Recorder.current.emit(new Blob(['before-background']))
  page.hidden = true
  page.dispatchEvent(new Event('visibilitychange'))
  expect(stream.track.stopCalls).toBe(1)
  await flush()
  expect(results[0]!.interrupted).toBe(true)
  expect(await results[0]!.audio.text()).toBe('before-backgroundfinal')
})

test('an ended microphone also preserves audio instead of abandoning the recorder', async () => {
  await start()
  stream.track.stop()
  await flush()
  expect(results[0]!.interrupted).toBe(true)
})

test('90 seconds and the byte ceiling stop recording without leaving tracks active', async () => {
  await start()
  now = RECORDING_LIMITS.seconds * 1000
  tick()
  await flush()
  expect(stream.track.ended).toBe(true)
  expect(results[0]!.durationSeconds).toBe(RECORDING_LIMITS.seconds)
  stream = new Stream()
  results = []
  now = 0
  await start()
  Recorder.current.emit(new Blob([new Uint8Array(RECORDING_LIMITS.bytes + 1)]))
  await flush()
  expect(stream.track.ended).toBe(true)
  expect(results).toEqual([])
  expect(errors[0]).toContain('超过12 MB')
})

test('available audio analysis distinguishes a silent recording', async () => {
  let closed = false
  replace(
    'AudioContext',
    class {
      state = 'running'
      createAnalyser() {
        return { fftSize: 1024, getByteTimeDomainData: (array: Uint8Array) => array.fill(128) }
      }
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} }
      }
      async resume() {}
      async close() {
        this.state = 'closed'
        closed = true
      }
    },
  )
  const session = await start()
  for (let i = 0; i < 6; i++) {
    now += 100
    tick()
  }
  session.stop()
  await flush()
  expect(results).toEqual([])
  expect(errors[0]).toContain('静音')
  expect(closed).toBe(true)
  expect(stream.track.ended).toBe(true)
})

test('unsupported contexts and devices have distinct text fallbacks; failed recorder startup releases input', async () => {
  expect(microphoneError(new DOMException('denied', 'NotAllowedError'))).toContain('权限被拒绝')
  expect(microphoneError(new DOMException('missing', 'NotFoundError'))).toContain('没有找到麦克风')
  expect(microphoneError(new DOMException('busy', 'NotReadableError'))).toContain('其他程序占用')
  replace('isSecureContext', false)
  await expect(start()).rejects.toThrow('安全连接')
  expect(requests).toBe(0)
  replace('isSecureContext', true)
  Recorder.failStart = true
  await expect(start()).rejects.toThrow('启动失败')
  expect(stream.track.ended).toBe(true)
  expect(cleared).toBeGreaterThan(0)
})
