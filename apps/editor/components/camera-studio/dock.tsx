'use client'

import { useEditor, useSidebarStore } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { Camera, Circle, Film, Pause, Play, Square, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  directorDuration,
  useCameraDirectorRuntime,
  useCameraDirectorState,
} from '@/lib/camera-director'
import { downloadFile } from './panel'
import { startCanvasRecording } from './recording'
import { useCameraStudio } from './store'
import './studio.css'

function SequenceTransport({ sceneId }: { sceneId: string }) {
  const state = useCameraDirectorState(sceneId)
  const runtime = useCameraDirectorRuntime(sceneId)
  const duration = directorDuration(state)
  const busy = state.transport.status !== 'idle'
  return (
    <>
      <span className="cs-dock-title">镜头序列</span>
      <button
        className="cs-play"
        aria-label={busy ? '停止预演' : '播放预演'}
        disabled={!runtime}
        onClick={() => (busy ? runtime?.stop() : runtime?.play())}
      >
        {busy ? <Square size={16} /> : <Play size={16} />}
      </button>
      <input
        className="cs-timeline"
        aria-label="序列时间线"
        type="range"
        min={0}
        max={Math.max(duration, 0.01)}
        step={1 / state.output.fps}
        value={Math.min(state.transport.currentTime, duration)}
        disabled={
          !runtime ||
          state.transport.status === 'recording' ||
          state.transport.status === 'exporting'
        }
        onChange={(event) => runtime?.seek(Number(event.target.value))}
      />
      <output>
        {state.transport.currentTime.toFixed(2)} / {duration.toFixed(2)} 秒
      </output>
    </>
  )
}

export function CameraStudioDock({ sceneId }: { sceneId: string }) {
  const state = useCameraStudio()
  const preview = useEditor((s) => s.isPreviewMode)
  const studio = useEditor((s) => s.workspaceMode === 'studio')
  const exclusiveMode = useEditor((s) => s.isFirstPersonMode || s.isCaptureMode)
  const cameraPanel = useEditor((s) => ['observe', 'record'].includes(s.activeSidebarPanel))
  const shot = state.project.shots.find((s) => s.id === state.selectedShotId)
  const [recording, setRecording] = useState(false)
  const [starting, setStarting] = useState(false)
  const [encoding, setEncoding] = useState(false)
  const [resolution, setResolution] = useState('1280x720')
  const [lastVideo, setLastVideo] = useState<{ url: string; name: string } | null>(null)
  const [showVideo, setShowVideo] = useState(false)
  const recorder = useRef<ReturnType<typeof startCanvasRecording> | null>(null)
  const recordingName = useRef('咫台')
  const disposed = useRef(false)
  const pending = useRef(false)
  const generation = useRef(0)
  const session = useRef(0)
  const videoDialog = useRef<HTMLDialogElement>(null)

  const cancelStart = useCallback(() => {
    generation.current += 1
    pending.current = false
    setStarting(false)
    useCameraStudio.getState().setRecording(false)
  }, [])

  useEffect(() => {
    disposed.current = false
    session.current += 1
    return () => {
      disposed.current = true
      generation.current += 1
      pending.current = false
      recorder.current?.cancel()
      recorder.current = null
      useCameraStudio.getState().setRecording(false)
      useCameraStudio.getState().stop()
    }
  }, [sceneId])

  useEffect(
    () => () => {
      if (lastVideo) URL.revokeObjectURL(lastVideo.url)
    },
    [lastVideo],
  )
  useEffect(() => {
    if (showVideo && videoDialog.current && !videoDialog.current.open)
      videoDialog.current.showModal()
  }, [showVideo])

  const finishRecording = useCallback(async () => {
    const active = recorder.current
    if (!active) return
    recorder.current = null
    const recordingSession = session.current
    setRecording(false)
    setEncoding(true)
    useCameraStudio.getState().pause()
    try {
      const { blob, extension } = await active.stop()
      if (disposed.current || session.current !== recordingSession) return
      const name = `${recordingName.current.replace(/[<>:"/\\|?*]/g, '_')}.${extension}`
      setLastVideo({ url: URL.createObjectURL(blob), name })
      downloadFile(blob, name)
      useCameraStudio.setState({ notice: `无声录像已完成：${name}` })
    } catch (error) {
      if (!disposed.current)
        useCameraStudio.setState({
          notice: error instanceof Error ? error.message : '录像编码失败',
        })
    } finally {
      if (!disposed.current && session.current === recordingSession) {
        setEncoding(false)
        useCameraStudio.getState().setRecording(false)
      }
    }
  }, [])

  useEffect(
    () =>
      useCameraStudio.subscribe((next, prev) => {
        if (
          pending.current &&
          (!next.previewing ||
            !next.runtimeReady ||
            next.canvas !== prev.canvas ||
            next.selectedShotId !== prev.selectedShotId ||
            next.project !== prev.project)
        )
          cancelStart()
        if (recorder.current && prev.playing && !next.playing) void finishRecording()
      }),
    [finishRecording, cancelStart],
  )

  const record = async () => {
    const current = useCameraStudio.getState()
    if (
      !current.canvas ||
      !current.runtimeReady ||
      !shot ||
      recorder.current ||
      encoding ||
      pending.current
    )
      return
    current.setRecording(true)
    const ticket = ++generation.current
    pending.current = true
    setStarting(true)
    current.seek(0)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    const latest = useCameraStudio.getState()
    if (disposed.current || ticket !== generation.current) return
    if (
      !latest.runtimeReady ||
      !latest.previewing ||
      latest.canvas !== current.canvas ||
      latest.selectedShotId !== current.selectedShotId ||
      latest.project !== current.project
    ) {
      cancelStart()
      return
    }
    pending.current = false
    setStarting(false)
    try {
      const [width, height] = resolution.split('x').map(Number)
      if (!width || !height) throw new Error('录像尺寸无效')
      recordingName.current = shot.name || '咫台-机位'
      recorder.current = startCanvasRecording(current.canvas, {
        width,
        height,
        fps: 30,
        onError: (message) => {
          recorder.current = null
          setRecording(false)
          useCameraStudio.getState().setRecording(false)
          useCameraStudio.getState().pause()
          useCameraStudio.setState({ notice: message })
        },
      })
      setRecording(true)
      latest.play()
    } catch (error) {
      useCameraStudio.getState().setRecording(false)
      useCameraStudio.setState({ notice: error instanceof Error ? error.message : '无法开始录制' })
    }
  }

  return (
    <>
      {!exclusiveMode &&
        (studio || cameraPanel || preview || starting || recording || encoding) && (
          <div className="cs-dock" role="group" aria-label="预演与视频录制">
            {studio && !cameraPanel ? (
              <>
                <SequenceTransport sceneId={sceneId} />
                <button
                  className="cs-button"
                  onClick={() => {
                    useEditor.getState().setPreviewMode(false)
                    useEditor.getState().setActiveSidebarPanel('camera-rehearsal')
                    useSidebarStore.getState().setIsCollapsed(false)
                  }}
                >
                  {preview ? '返回工作区' : '打开编排'}
                </button>
              </>
            ) : (
              <>
                <button
                  className="cs-dock-title"
                  aria-label="打开机位"
                  title="打开机位面板"
                  disabled={starting || recording || encoding}
                  onClick={() => {
                    state.stop()
                    useEditor.getState().setPreviewMode(false)
                    useEditor.getState().setActiveSidebarPanel('observe')
                    useSidebarStore.getState().setIsCollapsed(false)
                  }}
                >
                  <Camera size={17} />
                  <span>机位</span>
                </button>
                <select
                  aria-label="当前机位"
                  value={shot?.id ?? ''}
                  disabled={starting || recording || encoding}
                  onChange={(e) => state.selectShot(e.target.value)}
                >
                  {state.project.shots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  aria-label={state.playing ? '暂停预演' : '播放预演'}
                  className="cs-play"
                  disabled={!state.runtimeReady || starting || recording || encoding}
                  onClick={() => (state.playing ? state.pause() : state.play())}
                >
                  {state.playing ? <Pause size={17} /> : <Play size={17} />}
                </button>
                <button
                  aria-label="停止并还原"
                  className="cs-icon"
                  disabled={recording || encoding}
                  onClick={() => {
                    cancelStart()
                    state.stop()
                  }}
                >
                  <Square size={15} />
                </button>
                <input
                  className="cs-timeline"
                  aria-label="运镜时间线"
                  type="range"
                  min={0}
                  max={shot?.duration ?? 1}
                  step={0.01}
                  value={state.time}
                  disabled={starting || recording || encoding || !state.runtimeReady}
                  onChange={(e) => state.seek(Number(e.target.value))}
                />
                <output aria-label="运镜时间读数">
                  {state.time.toFixed(1)} / {shot?.duration ?? 0} 秒
                </output>
                <button
                  className="cs-button"
                  aria-pressed={preview}
                  disabled={starting || recording || encoding}
                  onClick={() => {
                    state.stop()
                    useEditor.getState().setFirstPersonMode(false)
                    useEditor.getState().setViewMode('3d')
                    useViewer.getState().setCameraMode('perspective')
                    useEditor.getState().setPreviewMode(!preview)
                  }}
                >
                  <Film size={14} />
                  {preview ? '退出沉浸预览' : '沉浸预览'}
                </button>
                <select
                  aria-label="录像尺寸"
                  disabled={starting || recording || encoding}
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                >
                  <option value="1280x720">720p · 横屏</option>
                  <option value="1920x1080">1080p · 横屏</option>
                  <option value="1080x1920">1080p · 竖屏</option>
                  <option value="1080x1080">1080p · 方形</option>
                </select>
                <button
                  className={`cs-record ${recording ? 'is-recording' : ''}`}
                  disabled={starting || encoding || !state.runtimeReady}
                  onClick={() => (recording ? void finishRecording() : void record())}
                >
                  {recording ? (
                    <Square size={13} fill="currentColor" />
                  ) : (
                    <Circle size={13} fill="currentColor" />
                  )}
                  {starting
                    ? '准备录制'
                    : encoding
                      ? '正在编码'
                      : recording
                        ? '结束录制'
                        : '录制视频'}
                </button>
                {lastVideo && (
                  <button className="cs-link" onClick={() => setShowVideo(true)}>
                    查看录像
                  </button>
                )}
              </>
            )}
          </div>
        )}
      {state.notice && (
        <div className="cs-notice" role="status">
          <span>{state.notice}</span>
          <button aria-label="关闭提示" onClick={() => useCameraStudio.setState({ notice: '' })}>
            <X size={14} />
          </button>
        </div>
      )}
      {showVideo && lastVideo && (
        <dialog
          ref={videoDialog}
          className="cs-video-dialog"
          aria-label="录像回放"
          onClose={() => setShowVideo(false)}
        >
          <div>
            <strong>{lastVideo.name}</strong>
            <button aria-label="关闭录像回放" onClick={() => videoDialog.current?.close()}>
              <X size={20} />
            </button>
          </div>
          <video src={lastVideo.url} controls playsInline muted aria-label="无声镜头录像" />
          <a href={lastVideo.url} download={lastVideo.name}>
            下载视频
          </a>
        </dialog>
      )}
    </>
  )
}
