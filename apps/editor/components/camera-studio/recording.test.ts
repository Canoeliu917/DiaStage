import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flushGlobalEffects } from '@react-three/fiber'
import { startCanvasRecording } from './recording'

test('canvas recording preserves framing, chooses the real format, and releases failed sessions', async () => {
  const original = {
    document: globalThis.document,
    MediaRecorder: globalThis.MediaRecorder,
  }
  let tainted = false
  let empty = false
  let startFails = false
  let captureSupported = true
  let drawArguments: unknown[] = []
  let draws = 0
  let outputSize = { width: 0, height: 0 }
  const notices: string[] = []
  const options = { width: 1920, height: 1080, fps: 30, onError: (m: string) => notices.push(m) }
  const source = Object.assign(new EventTarget(), { width: 800, height: 600 }) as HTMLCanvasElement
  class Track extends EventTarget {
    stopped = false
    stop() {
      this.stopped = true
    }
  }
  let track = new Track()
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  class Recorder {
    static isTypeSupported: ((type: string) => boolean) | undefined = (type) => type === 'video/mp4'
    static last: Recorder
    state = 'inactive'
    mimeType: string
    ondataavailable: ((event: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(input: unknown, config: MediaRecorderOptions) {
      assert.equal(input, stream)
      assert.equal(config.videoBitsPerSecond, 4_000_000)
      this.mimeType = config.mimeType || 'video/webm'
      Recorder.last = this
    }
    start() {
      if (startFails) throw new Error('encoder unavailable')
      this.state = 'recording'
    }
    stop() {
      this.state = 'inactive'
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(empty ? [] : ['video'], { type: this.mimeType }) })
        this.onstop?.()
      })
    }
  }
  Object.assign(globalThis, {
    MediaRecorder: Recorder,
    document: {
      createElement: () => {
        track = new Track()
        const output = {
          width: 0,
          height: 0,
          captureStream: captureSupported ? () => stream : undefined,
          getContext: () => ({
            fillStyle: '',
            fillRect: () => {},
            drawImage: (...args: unknown[]) => {
              draws++
              drawArguments = args
            },
            getImageData: () => {
              if (tainted) throw new DOMException('tainted', 'SecurityError')
            },
          }),
        }
        outputSize = output
        return output
      },
    },
  })
  const tick = () => flushGlobalEffects('after', 0)
  try {
    const first = startCanvasRecording(source, options)
    assert.equal(outputSize.width, 1920)
    assert.equal(outputSize.height, 1080)
    assert.equal(draws, 0)
    assert.equal(Recorder.last.state, 'inactive')
    assert.throws(() => startCanvasRecording(source, options), /已经在录制/)
    flushGlobalEffects('before', 0)
    assert.equal(draws, 0)
    tick()
    assert.equal(Recorder.last.state, 'recording')
    assert.deepEqual(drawArguments.slice(1), [240, 0, 1440, 1080])
    const pending = first.stop()
    assert.equal(first.stop(), pending)
    const recorded = await pending
    assert.equal(recorded.extension, 'mp4')
    assert.equal(recorded.blob.type, 'video/mp4')
    assert.equal(track.stopped, true)
    const completedDraws = draws
    tick()
    assert.equal(draws, completedDraws)

    Recorder.isTypeSupported = undefined
    const fallbackRecording = startCanvasRecording(source, options)
    tick()
    const fallback = await fallbackRecording.stop()
    assert.equal(fallback.extension, 'webm')
    assert.equal(fallback.blob.type, 'video/webm')

    const cancelled = startCanvasRecording(source, options)
    cancelled.cancel()
    cancelled.cancel()
    await assert.rejects(cancelled.stop(), { name: 'AbortError' })
    assert.equal(track.stopped, true)
    assert.equal(notices.length, 0)

    empty = true
    const emptyRecording = startCanvasRecording(source, options)
    tick()
    await assert.rejects(emptyRecording.stop(), /未录到视频/)
    assert.equal(track.stopped, true)
    empty = false

    const ended = startCanvasRecording(source, options)
    track.dispatchEvent(new Event('ended'))
    await assert.rejects(ended.stop(), /视频轨道已关闭/)
    assert.equal(track.stopped, true)

    const lost = startCanvasRecording(source, options)
    source.dispatchEvent(new Event('webglcontextlost'))
    await assert.rejects(lost.stop(), /三维画面已中断/)

    const failed = startCanvasRecording(source, options)
    Recorder.last.onerror?.()
    await assert.rejects(failed.stop(), /浏览器编码失败/)

    const taintedDuringCapture = startCanvasRecording(source, options)
    tainted = true
    tick()
    await assert.rejects(taintedDuringCapture.stop(), /跨域素材/)
    tainted = false

    startFails = true
    const startFailure = startCanvasRecording(source, options)
    tick()
    await assert.rejects(startFailure.stop(), /无法开始视频编码/)
    assert.equal(track.stopped, true)
    startFails = false
    captureSupported = false
    assert.throws(() => startCanvasRecording(source, options), /不支持录制 Canvas/)
    captureSupported = true
    await assert.rejects(startCanvasRecording(source, options).stop(), /未录到视频/)
    const restored = startCanvasRecording(source, { ...options, width: 720, height: 1280 })
    tick()
    await restored.stop()
    assert.equal(track.stopped, true)
    const finalDraws = draws
    tick()
    assert.equal(draws, finalDraws)
    const defaults = startCanvasRecording(source)
    assert.equal(outputSize.width, 1280)
    assert.equal(outputSize.height, 720)
    tick()
    await defaults.stop()
  } finally {
    Object.assign(globalThis, original)
  }
})
