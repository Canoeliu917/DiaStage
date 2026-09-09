'use client'

import { addAfterEffect } from '@react-three/fiber'

const activeSources = new WeakSet<HTMLCanvasElement>()
const MIME_TYPES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]

type RecordingOptions = {
  width: number
  height: number
  fps: number
  onError?: (message: string) => void
}

type RecordingResult = { blob: Blob; extension: 'mp4' | 'webm' }

export function startCanvasRecording(
  source: HTMLCanvasElement,
  options: RecordingOptions = { width: 1920, height: 1080, fps: 30 },
): { stop: () => Promise<RecordingResult>; cancel: () => void } {
  const { width, height, fps } = options
  if (
    ![width, height, fps].every(Number.isInteger) ||
    width <= 0 ||
    height <= 0 ||
    width > 4096 ||
    height > 4096 ||
    width % 2 !== 0 ||
    height % 2 !== 0 ||
    fps < 1 ||
    fps > 60 ||
    (width * 9 !== height * 16 && width * 16 !== height * 9)
  ) {
    throw new Error('请选择 16:9 或 9:16 的有效录制尺寸，以及 1–60 帧的帧率。')
  }
  if (activeSources.has(source)) throw new Error('当前画面已经在录制。')
  if (typeof MediaRecorder === 'undefined') throw new Error('当前浏览器不支持画面录制。')
  if (!source.width || !source.height) throw new Error('三维画面尚未就绪。')

  const output = document.createElement('canvas')
  output.width = width
  output.height = height
  if (typeof output.captureStream !== 'function') {
    throw new Error('当前浏览器不支持录制 Canvas，请使用新版 Chrome 或 Edge。')
  }
  const context = output.getContext('2d', { alpha: false })
  if (!context) throw new Error('无法创建录制画面。')

  const draw = () => {
    if (!source.width || !source.height) throw new Error('三维画面尚未就绪。')
    const scale = Math.min(width / source.width, height / source.height)
    const drawWidth = source.width * scale
    const drawHeight = source.height * scale
    context.fillStyle = '#000'
    context.fillRect(0, 0, width, height)
    // Letterbox preserves the whole stage when the editor viewport has a different aspect ratio.
    context.drawImage(
      source,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    )
    // A tainted source otherwise silently mutes the captured stream instead of producing a file.
    context.getImageData(0, 0, 1, 1)
  }
  const stream = output.captureStream(fps)
  let recorder: MediaRecorder
  try {
    if (stream.getVideoTracks().length === 0) throw new Error('未能创建视频轨道。')
    const mimeType =
      typeof MediaRecorder.isTypeSupported === 'function'
        ? MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
        : undefined
    recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 8_000_000,
    })
  } catch (error) {
    for (const track of stream.getTracks()) track.stop()
    throw error
  }

  const chunks: Blob[] = []
  let removeAfterEffect = () => {}
  let started = false
  let stopping = false
  let finished = false
  let resolveResult!: (value: RecordingResult) => void
  let rejectResult!: (error: Error) => void
  const result = new Promise<RecordingResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  // Runtime errors may happen before the UI calls stop(); keep that rejection handled meanwhile.
  void result.catch(() => {})

  const release = () => {
    removeAfterEffect()
    activeSources.delete(source)
    source.removeEventListener('webglcontextlost', onContextLost)
    recorder.ondataavailable = null
    recorder.onerror = null
    recorder.onstop = null
    for (const track of stream.getTracks()) {
      track.removeEventListener('ended', onTrackEnded)
      track.stop()
    }
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        // Tracks are already released even if the encoder itself has failed.
      }
    }
    chunks.length = 0
  }
  const fail = (error: Error, notify = true) => {
    if (finished) return
    finished = true
    release()
    rejectResult(error)
    if (notify) options.onError?.(error.message)
  }
  const onContextLost = () => fail(new Error('三维画面已中断，请恢复画面后重新录制。'))
  const onTrackEnded = () => fail(new Error('视频轨道已关闭，录制未完成。'))
  source.addEventListener('webglcontextlost', onContextLost)
  for (const track of stream.getTracks()) track.addEventListener('ended', onTrackEnded)

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  recorder.onerror = () => fail(new Error('浏览器编码失败，请改用 720p 或其他浏览器重试。'))
  recorder.onstop = () => {
    if (finished) return
    if (!stopping) return fail(new Error('录制意外停止，请重新录制。'))
    if (chunks.length === 0) return fail(new Error('未录到视频画面，请播放场景后重试。'))
    const mimeType = recorder.mimeType || chunks[0]?.type || ''
    const extension = mimeType.startsWith('video/mp4')
      ? 'mp4'
      : mimeType.startsWith('video/webm')
        ? 'webm'
        : null
    if (!extension) return fail(new Error('浏览器返回了无法识别的视频格式。'))
    const blob = new Blob(chunks, { type: mimeType })
    finished = true
    release()
    resolveResult({ blob, extension })
  }

  const renderFrame = () => {
    if (finished || stopping) return
    try {
      draw()
    } catch (error) {
      fail(
        new Error(
          error instanceof DOMException && error.name === 'SecurityError'
            ? '画面包含不允许导出的跨域素材，录制已取消。'
            : '无法读取三维画面，录制已取消。',
        ),
      )
      return
    }
    if (!started) {
      try {
        recorder.start(1000)
        started = true
      } catch {
        fail(new Error('无法开始视频编码，请改用 720p 或其他浏览器重试。'))
      }
    }
  }
  activeSources.add(source)
  // Viewer.advance() runs this after its render pass, before WebGPU/WebGL present clears the canvas.
  // An independent rAF can run on a skipped render tick and copy an empty GPU backbuffer.
  removeAfterEffect = addAfterEffect(renderFrame)

  return {
    stop: () => {
      if (!finished && !stopping) {
        stopping = true
        removeAfterEffect()
        if (!started) {
          fail(new Error('未录到视频画面，请播放场景后重试。'))
        } else {
          try {
            recorder.stop()
          } catch (error) {
            fail(error instanceof Error ? error : new Error('无法完成视频编码。'))
          }
        }
      }
      return result
    },
    cancel: () => fail(new DOMException('录制已取消。', 'AbortError'), false),
  }
}
