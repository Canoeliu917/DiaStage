'use client'

import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import type { VoiceState } from './command-input'
import {
  microphoneError,
  RECORDING_LIMITS,
  type RecordingResult,
  type RecordingSession,
  startVoiceRecording,
} from './recording-session'

const TranscriptSchema = z.object({
  requestId: z.string(),
  transcript: z.string().trim().min(1).max(10000),
  language: z.string(),
  durationSeconds: z.number().finite().nonnegative(),
})

export function VoiceRecorder({
  state,
  setState,
  onTranscript,
  onError,
}: {
  state: VoiceState
  setState: (state: VoiceState) => void
  onTranscript: (text: string) => void
  onError: (message: string) => void
}) {
  const [elapsed, setElapsed] = useState(0)
  const recording = useRef<RecordingSession | null>(null)
  const recordingAbort = useRef<AbortController | null>(null)
  const requestAbort = useRef<AbortController | null>(null)
  const pending = useRef<RecordingResult | null>(null)
  const mounted = useRef(true)
  const callbacks = useRef({ setState, onTranscript, onError })
  useEffect(() => {
    callbacks.current = { setState, onTranscript, onError }
  }, [setState, onTranscript, onError])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      recordingAbort.current?.abort()
      requestAbort.current?.abort()
      recording.current?.dispose()
      pending.current = null
    }
  }, [])
  const transcribe = async (result: RecordingResult) => {
    if (!mounted.current || requestAbort.current) return
    const controller = new AbortController()
    requestAbort.current = controller
    callbacks.current.setState('transcribing')
    callbacks.current.onError('')
    const timeout = setTimeout(
      () => controller.abort(new Error('转写超时，请检查网络后重试。')),
      65000,
    )
    try {
      const form = new FormData()
      form.set(
        'audio',
        result.audio,
        result.audio.type.includes('mp4') ? 'stage-voice.m4a' : 'stage-voice.webm',
      )
      form.set('locale', 'zh-CN')
      const response = await fetch('/api/ai/transcribe', {
        method: 'POST',
        body: form,
        signal: controller.signal,
      })
      const raw: unknown = await response.json()
      if (!response.ok) {
        const error = z.object({ error: z.object({ message: z.string() }) }).safeParse(raw)
        throw new Error(
          error.success ? error.data.error.message : '转写服务暂时不可用，请重试或输入文字。',
        )
      }
      const parsed = TranscriptSchema.safeParse(raw)
      if (!parsed.success)
        throw new Error('没有识别到有效文字。请检查麦克风后重新录音，或直接输入文字。')
      if (controller.signal.aborted || !mounted.current) return
      pending.current = null
      callbacks.current.onTranscript(parsed.data.transcript)
      callbacks.current.setState('idle')
    } catch (error) {
      if (
        !mounted.current ||
        (controller.signal.aborted &&
          !(
            controller.signal.reason instanceof Error &&
            controller.signal.reason.name !== 'AbortError'
          ))
      )
        return
      const message = controller.signal.aborted
        ? '转写超时，录音片段仍保留在本页。请重试或输入文字。'
        : error instanceof TypeError
          ? '网络连接失败，录音片段仍保留在本页。请检查连接后重试。'
          : microphoneError(error)
      callbacks.current.onError(message)
      callbacks.current.setState('error')
    } finally {
      clearTimeout(timeout)
      if (requestAbort.current === controller) requestAbort.current = null
    }
  }
  const start = async () => {
    if (recordingAbort.current || requestAbort.current) return
    const controller = new AbortController()
    recordingAbort.current = controller
    pending.current = null
    setElapsed(0)
    callbacks.current.onError('')
    callbacks.current.setState('requesting-permission')
    try {
      const session = await startVoiceRecording(
        controller.signal,
        (seconds) => {
          if (mounted.current) setElapsed(seconds)
        },
        (result) => {
          if (recordingAbort.current === controller) {
            recording.current = null
            recordingAbort.current = null
          }
          if (!mounted.current) return
          pending.current = result
          if (result.interrupted) {
            callbacks.current.onError(
              '录音因切到后台或设备中断而停止，已有片段仍保留在本页。请点击“转写录音片段”或重新录音。',
            )
            callbacks.current.setState('error')
          } else void transcribe(result)
        },
        (message) => {
          if (recordingAbort.current === controller) {
            recording.current = null
            recordingAbort.current = null
          }
          if (mounted.current) {
            callbacks.current.onError(message)
            callbacks.current.setState('error')
          }
        },
      )
      if (controller.signal.aborted || !mounted.current) {
        session.dispose()
        return
      }
      recording.current = session
      callbacks.current.setState('recording')
    } catch (error) {
      if (recordingAbort.current === controller) recordingAbort.current = null
      if (controller.signal.aborted || !mounted.current) return
      callbacks.current.onError(microphoneError(error))
      callbacks.current.setState('error')
    }
  }
  const cancel = () => {
    recordingAbort.current?.abort()
    requestAbort.current?.abort()
    recording.current?.dispose()
    recordingAbort.current = null
    requestAbort.current = null
    recording.current = null
    pending.current = null
    callbacks.current.onError('')
    callbacks.current.setState('idle')
  }
  const active = ['requesting-permission', 'recording', 'transcribing'].includes(state)
  const disabled = ['planning', 'applying', 'review', 'needs-clarification'].includes(state)
  return (
    <div className="stage-voice-recorder">
      <div className="stage-entry-actions">
        {state === 'recording' ? (
          <button
            type="button"
            style={{ minHeight: 44, minWidth: 44 }}
            onClick={() => recording.current?.stop()}
          >
            停止并转写
          </button>
        ) : (
          <button
            type="button"
            style={{ minHeight: 44, minWidth: 44 }}
            disabled={active || disabled}
            onClick={() => void start()}
          >
            {state === 'requesting-permission'
              ? '等待麦克风授权…'
              : state === 'transcribing'
                ? '正在转写…'
                : '开始说话'}
          </button>
        )}
        {pending.current && !active && !disabled && (
          <button
            type="button"
            style={{ minHeight: 44 }}
            onClick={() => pending.current && void transcribe(pending.current)}
          >
            转写录音片段
          </button>
        )}
        {active && (
          <button type="button" style={{ minHeight: 44 }} onClick={cancel}>
            取消录音处理
          </button>
        )}
      </div>
      <p role="status" aria-live="polite">
        {state === 'recording'
          ? `正在录音 ${Math.floor(elapsed)} / ${RECORDING_LIMITS.seconds} 秒 · 点击停止后可修改转写文字。`
          : state === 'requesting-permission'
            ? '请在浏览器提示中允许使用麦克风。'
            : state === 'transcribing'
              ? '正在把录音转为文字，完成后请先检查内容。'
              : '录音最长90秒；也可以直接输入文字。原始录音仅暂存于本页。'}
      </p>
    </div>
  )
}
