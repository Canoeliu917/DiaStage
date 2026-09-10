import { z } from 'zod'
import { AiError } from './api'
import { type ValidatedAudio, validateAudio } from './audio-validation'

export type AudioTranscriber = (audio: ValidatedAudio, signal: AbortSignal) => Promise<unknown>

const responseSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
  languages: z
    .array(z.object({ code: z.string().min(2).max(16) }))
    .max(20)
    .optional(),
})

const callTranscriber: AudioTranscriber = async (audio, signal) => {
  const { transcribeAudio } = await import('./openai-server')
  return transcribeAudio(audio, signal)
}

export async function transcribeVoice(
  file: File,
  signal: AbortSignal,
  transcriber: AudioTranscriber = callTranscriber,
): Promise<{ transcript: string; language: string; durationSeconds: number }> {
  const audio = await validateAudio(file, signal)
  let result: unknown
  try {
    result = await transcriber(audio, signal)
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof AiError) throw error
    throw new AiError(
      'TRANSCRIPTION_FAILED',
      '转写暂时失败，请重试，或直接输入舞台口令。',
      502,
      true,
    )
  }
  signal.throwIfAborted()
  const parsed = responseSchema.safeParse(result)
  if (!parsed.success || parsed.data.languages?.length === 0)
    throw new AiError(
      'TRANSCRIPTION_FAILED',
      '未识别到清晰语音，请靠近麦克风重新录制，或直接输入文字。',
      422,
      true,
    )
  return {
    transcript: parsed.data.text,
    language: parsed.data.languages?.[0]?.code ?? 'zh',
    durationSeconds: audio.durationSeconds,
  }
}
