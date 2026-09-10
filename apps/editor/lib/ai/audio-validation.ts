import { BufferSource, EncodedPacketSink, Input, MP4, WEBM } from 'mediabunny'
import { AiError, readBoundedBody, withAbort } from './api'

export const AUDIO_LIMITS = {
  maxBytes: 12 * 1024 * 1024,
  maxSeconds: 90,
  multipartOverheadBytes: 64 * 1024,
  maxPackets: 50_000,
} as const

export interface ValidatedAudio {
  bytes: Uint8Array<ArrayBuffer>
  mime: 'audio/mp4' | 'audio/webm'
  extension: 'mp4' | 'webm'
  durationSeconds: number
}

const unsupported = (message = '录音文件无法读取，请重新录制 MP4 或 WebM 音频。') =>
  new AiError('AUDIO_UNSUPPORTED', message, 422)

function opusPacketDuration(data: Uint8Array): number {
  const toc = data[0]!
  const config = toc >> 3
  const code = toc & 3
  const frames = code === 0 ? 1 : code === 3 ? (data[1] ?? 0) & 63 : 2
  // RFC 6716 sections 3.1–3.2: duration comes from encoded frames, independent of container timestamps.
  const frameMs =
    config < 12
      ? [10, 20, 40, 60][config % 4]!
      : config < 16
        ? 10 * (1 + (config % 2))
        : 2.5 * 2 ** (config % 4)
  const duration = (frameMs * frames) / 1000
  if (duration <= 0 || duration > 0.12) throw unsupported()
  return duration
}

export async function readAudioUpload(request: Request, signal: AbortSignal): Promise<File> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!/^multipart\/form-data\s*;\s*boundary=/i.test(contentType))
    throw unsupported('请使用录音上传表单。')
  const bytes = await readBoundedBody(
    request,
    AUDIO_LIMITS.maxBytes + AUDIO_LIMITS.multipartOverheadBytes,
    signal,
  )
  let form: FormData
  try {
    form = await withAbort(
      new Response(bytes, { headers: { 'content-type': contentType } }).formData(),
      signal,
    )
  } catch {
    signal.throwIfAborted()
    throw unsupported('录音上传不完整，请重新上传。')
  }
  const entries = [...form.entries()]
  if (
    entries.length !== 2 ||
    form.getAll('audio').length !== 1 ||
    form.getAll('locale').length !== 1 ||
    form.get('locale') !== 'zh-CN'
  )
    throw unsupported('录音表单需要一份音频和 zh-CN 语言设置。')
  const file = form.get('audio')
  if (!(file instanceof File)) throw unsupported('没有收到录音文件，请重新录制。')
  if (file.size > AUDIO_LIMITS.maxBytes)
    throw new AiError('FILE_TOO_LARGE', '录音不能超过 12 MB，请分段录制。', 413)
  return file
}

export async function validateAudio(file: File, signal: AbortSignal): Promise<ValidatedAudio> {
  signal.throwIfAborted()
  if (file.size > AUDIO_LIMITS.maxBytes)
    throw new AiError('FILE_TOO_LARGE', '录音不能超过 12 MB，请分段录制。', 413)
  const bytes = new Uint8Array(await withAbort(file.arrayBuffer(), signal))
  const mime = file.type.split(';')[0]?.trim().toLowerCase()
  if (bytes.length < 12 || (mime !== 'audio/mp4' && mime !== 'audio/webm')) throw unsupported()
  const mp4 = String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp'
  const webm = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
  if ((mime === 'audio/mp4' && !mp4) || (mime === 'audio/webm' && !webm))
    throw unsupported('录音的实际格式与声明类型不一致，请重新录制。')
  if (webm && bytes[4] === 0) throw unsupported()
  if (mp4) {
    const headerSize = new DataView(bytes.buffer).getUint32(0)
    if (headerSize < 16 || headerSize > bytes.length) throw unsupported()
  }
  const input = new Input({ source: new BufferSource(bytes), formats: [MP4, WEBM] })
  const dispose = () => input.dispose()
  signal.addEventListener('abort', dispose, { once: true })
  try {
    signal.throwIfAborted()
    const format = await withAbort(input.getFormat(), signal)
    if (format !== (mp4 ? MP4 : WEBM)) throw unsupported()
    const tracks = await withAbort(input.getTracks(), signal)
    if (tracks.length !== 1 || !tracks[0]?.isAudioTrack())
      throw unsupported('请上传单一音轨的录音，不要上传视频或多音轨文件。')
    const track = tracks[0]
    const [codec, sampleRate, channels, codecString] = await withAbort(
      Promise.all([
        track.getCodec(),
        track.getSampleRate(),
        track.getNumberOfChannels(),
        track.getCodecParameterString(),
      ]),
      signal,
    )
    if (
      !codec ||
      !['aac', 'opus'].includes(codec) ||
      !Number.isFinite(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192000 ||
      channels < 1 ||
      channels > 2
    )
      throw unsupported('这份录音的编码不受支持，请使用浏览器重新录制。')
    const claimedCodec = file.type
      .match(/(?:^|;)\s*codecs\s*=\s*"?([^";]+)/i)?.[1]
      ?.trim()
      .toLowerCase()
    if (claimedCodec && claimedCodec !== codecString?.toLowerCase())
      throw unsupported('录音的实际编码与声明类型不一致，请重新录制。')
    const packets = new EncodedPacketSink(track).packets()
    let count = 0
    let first = Infinity
    let end = 0
    let total = 0
    try {
      while (true) {
        const result = await withAbort(packets.next(), signal)
        if (result.done) break
        const packet = result.value
        if (
          !Number.isFinite(packet.timestamp) ||
          !Number.isFinite(packet.duration) ||
          packet.duration < 0 ||
          packet.data.byteLength === 0
        )
          throw unsupported()
        if (++count > AUDIO_LIMITS.maxPackets)
          throw unsupported('录音包含过多音频分段，请重新录制。')
        const duration =
          codec === 'opus'
            ? Math.max(packet.duration, opusPacketDuration(packet.data))
            : packet.duration
        first = Math.min(first, packet.timestamp)
        end = Math.max(end, packet.timestamp + duration)
        total += duration
        if (Math.max(end, end - first, total) > AUDIO_LIMITS.maxSeconds + 1e-6)
          throw unsupported('单次录音不能超过 90 秒，请分成两段录制。')
        // Yield to the timeout/cancellation task while scanning packet data, never decode audio.
        if (count % 256 === 0)
          await withAbort(new Promise<void>((resolve) => setTimeout(resolve, 0)), signal)
      }
    } finally {
      await packets.return()
    }
    const durationSeconds = Math.max(end, end - first, total)
    if (count === 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0)
      throw unsupported('录音没有可用音频，请检查麦克风后重新录制。')
    return { bytes, mime, extension: mp4 ? 'mp4' : 'webm', durationSeconds }
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof AiError) throw error
    throw unsupported()
  } finally {
    signal.removeEventListener('abort', dispose)
    input.dispose()
  }
}
