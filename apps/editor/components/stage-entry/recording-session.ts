export const RECORDING_LIMITS = { seconds: 90, bytes: 12 * 1024 * 1024 } as const
const audioTypes = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'] as const

export function preferredAudioType(
  recorder: Pick<typeof MediaRecorder, 'isTypeSupported'>,
): string | null {
  return audioTypes.find((type) => recorder.isTypeSupported(type)) ?? null
}

export function microphoneError(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError')
    return '麦克风权限被拒绝。请在浏览器地址栏允许麦克风，或直接输入文字。'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
    return '没有找到麦克风。请连接输入设备，或直接输入文字。'
  if (name === 'NotReadableError' || name === 'TrackStartError')
    return '麦克风无法读取，可能正被其他程序占用。请关闭占用后重试，或输入文字。'
  if (name === 'SecurityError')
    return '浏览器禁止此页面使用麦克风。请通过 HTTPS 打开网站，或输入文字。'
  return error instanceof Error ? error.message : '录音未能开始，请重试或输入文字。'
}

export type RecordingResult = { audio: Blob; durationSeconds: number; interrupted: boolean }
export type RecordingSession = { stop: () => void; dispose: () => void }

export async function startVoiceRecording(
  signal: AbortSignal,
  onTick: (seconds: number) => void,
  onComplete: (result: RecordingResult) => void,
  onError: (message: string) => void,
): Promise<RecordingSession> {
  if (!globalThis.isSecureContext)
    throw new Error('录音需要安全连接。请通过 HTTPS 或本机地址打开网站，也可以直接输入文字。')
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
    throw new Error('当前浏览器不支持录音。请更新浏览器，或直接输入文字。')
  const mimeType = preferredAudioType(MediaRecorder)
  if (!mimeType) throw new Error('当前浏览器没有可用的录音格式。请换用新版浏览器，或直接输入文字。')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const releaseTracks = () => {
    for (const track of stream.getTracks()) track.stop()
  }
  if (signal.aborted) {
    releaseTracks()
    throw new DOMException('录音已取消', 'AbortError')
  }
  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 })
  } catch (error) {
    releaseTracks()
    throw error
  }
  const chunks: Blob[] = []
  let bytes = 0,
    stoppedAt = 0,
    peak = 0,
    samples = 0
  let stopReason: 'complete' | 'interrupted' | 'discard' | null = null
  let audioContext: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let source: MediaStreamAudioSourceNode | null = null
  if (typeof AudioContext !== 'undefined') {
    try {
      audioContext = new AudioContext()
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 1024
      source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      void audioContext.resume().catch(() => {})
    } catch {
      void audioContext?.close().catch(() => {})
      audioContext = null
      analyser = null
    }
  }
  const startedAt = performance.now()
  const sample = new Uint8Array(1024)
  const cleanup = () => {
    clearInterval(timer)
    signal.removeEventListener('abort', discard)
    document.removeEventListener('visibilitychange', visibility)
    for (const track of stream.getTracks()) track.removeEventListener('ended', interrupted)
    releaseTracks()
    source?.disconnect()
    if (audioContext && audioContext.state !== 'closed') void audioContext.close().catch(() => {})
  }
  const stop = (reason: 'complete' | 'interrupted' | 'discard') => {
    if (stopReason) return
    stopReason = reason
    stoppedAt = performance.now()
    clearInterval(timer)
    if (recorder.state !== 'inactive') recorder.stop()
    // The final dataavailable event is queued by stop(); release hardware immediately.
    releaseTracks()
  }
  const discard = () => {
    stopReason = null
    stop('discard')
    cleanup()
    chunks.length = 0
  }
  const interrupted = () => stop('interrupted')
  const visibility = () => {
    if (document.hidden) interrupted()
  }
  const timer = setInterval(() => {
    const elapsed = (performance.now() - startedAt) / 1000
    onTick(Math.min(RECORDING_LIMITS.seconds, elapsed))
    if (analyser && audioContext?.state === 'running') {
      analyser.getByteTimeDomainData(sample)
      samples++
      for (const value of sample) peak = Math.max(peak, Math.abs(value - 128))
    }
    if (elapsed >= RECORDING_LIMITS.seconds) stop('complete')
  }, 100)
  recorder.ondataavailable = (event) => {
    if (stopReason === 'discard' || signal.aborted || event.data.size === 0) return
    bytes += event.data.size
    if (bytes > RECORDING_LIMITS.bytes) {
      stop('complete')
      return
    }
    chunks.push(event.data)
  }
  recorder.onerror = interrupted
  recorder.onstop = () => {
    cleanup()
    if (stopReason === 'discard' || signal.aborted) return
    const durationSeconds = ((stoppedAt || performance.now()) - startedAt) / 1000
    if (bytes > RECORDING_LIMITS.bytes) {
      chunks.length = 0
      onError('录音超过12 MB，请缩短口令后重新录音，或改用文字。')
      return
    }
    if (chunks.length === 0 || bytes === 0) {
      onError('没有录到声音。请检查麦克风输入后重试，也可以直接输入文字。')
      return
    }
    if (samples >= 5 && peak < 2) {
      chunks.length = 0
      onError('这段录音几乎没有声音。请检查麦克风是否静音，靠近麦克风重试，或输入文字。')
      return
    }
    const audio = new Blob(chunks, { type: recorder.mimeType || mimeType })
    chunks.length = 0
    onComplete({ audio, durationSeconds, interrupted: stopReason !== 'complete' })
  }
  signal.addEventListener('abort', discard, { once: true })
  document.addEventListener('visibilitychange', visibility)
  for (const track of stream.getTracks())
    track.addEventListener('ended', interrupted, { once: true })
  try {
    recorder.start(1000)
  } catch (error) {
    discard()
    throw error
  }
  return { stop: () => stop('complete'), dispose: discard }
}
