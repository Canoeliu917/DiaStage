'use client'

import { emitter, sceneRegistry } from '@pascal-app/core'
import { GRID_LAYER, useViewer } from '@pascal-app/viewer'
import { type CameraControlsImpl, Html } from '@react-three/drei'
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { Box3, type Camera, type PerspectiveCamera, Vector3 } from 'three'
import {
  type CameraDirectorState,
  type CameraPoseKey,
  directorDuration,
  focalLengthToVerticalFov,
  getCameraDirectorState,
  hydrateCameraDirector,
  reduceTakeKeys,
  registerCameraDirectorRuntime,
  sampleDirectorPose,
  stepDampedPose,
  type TakeSample,
  updateCameraDirector,
  useCameraDirectorState,
} from '@/lib/camera-director'

interface CameraRehearsalSystemProps {
  sceneId: string
}

const readPosition = new Vector3()
const readTarget = new Vector3()
const selectionBounds = new Box3()
const selectionCenter = new Vector3()
const fallbackDirection = new Vector3()
const rigLabels = { fixed: '固定', rail: '两点移动', orbit: '环绕' }

function isPerspective(camera: Camera): camera is PerspectiveCamera {
  return (camera as PerspectiveCamera).isPerspectiveCamera === true
}

function tuple(vector: Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z]
}

function readCameraPose(
  camera: Camera,
  controls: CameraControlsImpl | null,
  state: CameraDirectorState,
): CameraPoseKey {
  if (controls) {
    controls.getPosition(readPosition, false)
    controls.getTarget(readTarget, false)
  } else {
    readPosition.copy(camera.position)
    camera.getWorldDirection(fallbackDirection)
    readTarget.copy(camera.position).add(fallbackDirection.multiplyScalar(8))
  }
  return {
    position: tuple(readPosition),
    target: tuple(readTarget),
    focalLengthMm: isPerspective(camera)
      ? state.lens.sensorHeightMm / (2 * Math.tan((camera.fov * Math.PI) / 360))
      : state.lens.focalLengthMm,
    focusDistanceM: state.lens.focusDistanceM,
  }
}

function setCameraPose(
  camera: Camera,
  controls: CameraControlsImpl | null,
  pose: CameraPoseKey,
  sensorHeightMm: number,
): void {
  if (controls) {
    void controls.setLookAt(
      pose.position[0],
      pose.position[1],
      pose.position[2],
      pose.target[0],
      pose.target[1],
      pose.target[2],
      false,
    )
    controls.update(0)
  } else {
    camera.position.set(...pose.position)
    camera.lookAt(...pose.target)
  }
  if (isPerspective(camera)) {
    camera.fov = focalLengthToVerticalFov(pose.focalLengthMm, sensorHeightMm)
    camera.updateProjectionMatrix()
  }
  camera.updateMatrixWorld()
}

function patchTransport(sceneId: string, patch: Partial<CameraDirectorState['transport']>): void {
  updateCameraDirector(
    sceneId,
    (state) => ({
      ...state,
      transport: { ...state.transport, ...patch },
    }),
    { persist: false },
  )
}

function cameraSnapshot(camera: Camera, controls: CameraControlsImpl | null): () => void {
  const position = controls?.getPosition(new Vector3(), false) ?? camera.position.clone()
  const target = controls?.getTarget(new Vector3(), false)
  const quaternion = camera.quaternion.clone()
  const up = camera.up.clone()
  const layers = camera.layers.mask
  const fov = isPerspective(camera) ? camera.fov : null
  const parameters = controls
    ? {
        enabled: controls.enabled,
        smoothTime: controls.smoothTime,
        draggingSmoothTime: controls.draggingSmoothTime,
        maxSpeed: controls.maxSpeed,
      }
    : null
  return () => {
    camera.up.copy(up)
    camera.layers.mask = layers
    if (controls && target && parameters) {
      Object.assign(controls, parameters)
      void controls.setLookAt(...position.toArray(), ...target.toArray(), false)
      controls.update(0)
    } else {
      camera.position.copy(position)
    }
    camera.quaternion.copy(quaternion)
    if (isPerspective(camera) && fov !== null) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    camera.updateMatrixWorld()
  }
}

function cancelled(): DOMException {
  return new DOMException('导出已取消。', 'AbortError')
}

function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? cancelled())
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', abort)
      resolve()
    }
    const timer = window.setTimeout(finish, Math.max(milliseconds, 0))
    const abort = () => {
      window.clearTimeout(timer)
      reject(signal.reason ?? cancelled())
    }
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function outputCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function drawCover(
  source: HTMLCanvasElement,
  destination: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
): void {
  const sourceWidth = source.width
  const sourceHeight = source.height
  const sourceAspect = sourceWidth / Math.max(sourceHeight, 1)
  const destinationAspect = destination.width / Math.max(destination.height, 1)
  let cropX = 0
  let cropY = 0
  let cropWidth = sourceWidth
  let cropHeight = sourceHeight
  if (sourceAspect > destinationAspect) {
    cropWidth = sourceHeight * destinationAspect
    cropX = (sourceWidth - cropWidth) / 2
  } else {
    cropHeight = sourceWidth / destinationAspect
    cropY = (sourceHeight - cropHeight) / 2
  }
  context.drawImage(
    source,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    destination.width,
    destination.height,
  )
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('浏览器未能编码 PNG 帧。'))
    }, 'image/png')
  })
}

function supportedRecorderMimeType(): string {
  const choices = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  const mime = choices.find((choice) => MediaRecorder.isTypeSupported(choice))
  if (!mime) throw new Error('当前浏览器不支持 WebM 编码，请改用 PNG 序列。')
  return mime
}

function padFrame(frame: number): string {
  return String(frame).padStart(5, '0')
}

function stepRehearsalPose(
  state: CameraDirectorState,
  current: CameraPoseKey | null,
  time: number,
  delta: number,
): CameraPoseKey | null {
  const desired = sampleDirectorPose(state, time)
  if (!desired || !current || time === 0 || time >= directorDuration(state)) return desired
  const focusSpeed = state.lens.smoothFocusChanges
    ? state.lens.focusSmoothingSpeed
    : Number.POSITIVE_INFINITY
  return stepDampedPose(current, desired, delta, state.control, focusSpeed)
}

export function CameraRehearsalSystem({ sceneId }: CameraRehearsalSystemProps) {
  const camera = useThree((three) => three.camera)
  return isPerspective(camera) ? <ActiveCameraRehearsalSystem sceneId={sceneId} /> : null
}

function ActiveCameraRehearsalSystem({ sceneId }: CameraRehearsalSystemProps) {
  const state = useCameraDirectorState(sceneId)
  const camera = useThree((three) => three.camera)
  const controls = useThree((three) => three.controls) as CameraControlsImpl | null
  const gl = useThree((three) => three.gl)
  const size = useThree((three) => three.size)
  const invalidate = useThree((three) => three.invalidate)
  const currentPoseRef = useRef<CameraPoseKey | null>(null)
  const playbackElapsedRef = useRef(0)
  const recordingElapsedRef = useRef(0)
  const nextSampleAtRef = useRef(0)
  const recordingSamplesRef = useRef<TakeSample[]>([])
  const lastUiUpdateRef = useRef(0)
  const mountedRef = useRef(true)
  const exportRef = useRef<{ controller: AbortController; restore: () => void } | null>(null)
  const frameRef = useRef<{
    pose: CameraPoseKey
    sensorHeightMm: number
    applied: boolean
    copy: () => void
    resolve: () => void
    reject: (error: unknown) => void
  } | null>(null)

  useEffect(
    () =>
      addAfterEffect(() => {
        const frame = frameRef.current
        if (!frame?.applied) return
        frameRef.current = null
        try {
          // Copy before the GPU backbuffer is presented; toBlob can then run asynchronously.
          frame.copy()
          frame.resolve()
        } catch (error) {
          frame.reject(error)
        }
      }),
    [],
  )

  useEffect(() => {
    const status = getCameraDirectorState(sceneId).transport.status
    if (!isPerspective(camera) || status === 'playing' || status === 'exporting') return
    camera.fov = focalLengthToVerticalFov(state.lens.focalLengthMm, state.lens.sensorHeightMm)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, invalidate, state.lens.focalLengthMm, state.lens.sensorHeightMm, sceneId])

  useEffect(() => {
    if (!controls) return
    controls.smoothTime = state.control.enabled
      ? Math.max(1 / Math.max(state.control.positionLagSpeed, 0.01), 0.025)
      : 0.01
    controls.draggingSmoothTime = state.control.enabled
      ? Math.max(0.5 / Math.max(state.control.rotationLagSpeed, 0.01), 0.02)
      : 0.01
    controls.maxSpeed = state.control.maxSpeed
  }, [
    controls,
    state.control.enabled,
    state.control.maxSpeed,
    state.control.positionLagSpeed,
    state.control.rotationLagSpeed,
  ])

  const enableControls = useCallback(
    (enabled: boolean) => {
      if (controls) controls.enabled = enabled
    },
    [controls],
  )

  const applyPose = useCallback(
    (pose: CameraPoseKey) => {
      setCameraPose(camera, controls, pose, getCameraDirectorState(sceneId).lens.sensorHeightMm)
      invalidate()
    },
    [camera, controls, invalidate, sceneId],
  )

  const captureKey = useCallback(
    (slot: 'start' | 'end') => {
      if (!mountedRef.current || exportRef.current) return
      const latest = getCameraDirectorState(sceneId)
      const pose = readCameraPose(camera, controls, latest)
      updateCameraDirector(sceneId, (current) => ({
        ...current,
        sequence: { ...current.sequence, [slot]: pose },
        transport: {
          ...current.transport,
          error: null,
          message: slot === 'start' ? '已设置起点 A。' : '已设置终点 B。',
        },
      }))
    },
    [camera, controls, sceneId],
  )

  const focusSelection = useCallback(() => {
    if (!mountedRef.current || exportRef.current) return
    const latest = getCameraDirectorState(sceneId)
    const selection = useViewer.getState().selection.selectedIds
    const selectedId = selection[0] ?? latest.lens.focusTargetId
    const object = selectedId ? sceneRegistry.nodes.get(selectedId) : null
    if (!selectedId || !object) {
      patchTransport(sceneId, {
        error: '请在面板选择可用的注视对象。',
        message: null,
      })
      return
    }
    selectionBounds.setFromObject(object).getCenter(selectionCenter)
    const pose = readCameraPose(camera, controls, latest)
    const focusDistanceM = readPosition.distanceTo(selectionCenter)
    emitter.emit('camera-controls:cancel-pose', undefined)
    if (controls) {
      void controls.setLookAt(
        pose.position[0],
        pose.position[1],
        pose.position[2],
        selectionCenter.x,
        selectionCenter.y,
        selectionCenter.z,
        true,
      )
    } else {
      camera.lookAt(selectionCenter)
    }
    updateCameraDirector(sceneId, (current) => ({
      ...current,
      lens: { ...current.lens, focusDistanceM, focusTargetId: selectedId },
      transport: {
        ...current.transport,
        error: null,
        message: `镜头已转向 ${selectedId}。`,
      },
    }))
    invalidate()
  }, [camera, controls, invalidate, sceneId])

  const finishRecording = useCallback(() => {
    const latest = getCameraDirectorState(sceneId)
    const raw = recordingSamplesRef.current
    if (latest.transport.status !== 'recording' && raw.length === 0) return
    if (raw.length > 0 && recordingElapsedRef.current > raw[raw.length - 1]!.time) {
      raw.push({ ...readCameraPose(camera, controls, latest), time: recordingElapsedRef.current })
    }
    const keys = latest.take.reduceKeys ? reduceTakeKeys(raw, latest.take.tolerance) : [...raw]
    updateCameraDirector(sceneId, (current) => ({
      ...current,
      sequence: { ...current.sequence, source: keys.length > 0 ? 'take' : current.sequence.source },
      take: {
        ...current.take,
        rawSampleCount: raw.length,
        keys,
      },
      transport: {
        status: 'idle',
        currentTime: 0,
        error: null,
        message:
          raw.length > 0
            ? `手动运镜已记录：${raw.length} 个采样简化为 ${keys.length} 个关键帧。`
            : '记录已停止，但没有捕捉到镜头运动。',
      },
    }))
    recordingSamplesRef.current = []
    enableControls(true)
  }, [camera, controls, enableControls, sceneId])

  const cancelExport = useCallback(() => {
    const active = exportRef.current
    if (!active) return
    exportRef.current = null
    active.controller.abort(cancelled())
    active.restore()
  }, [])

  useLayoutEffect(() => {
    mountedRef.current = true
    const restore = cameraSnapshot(camera, controls)
    hydrateCameraDirector(sceneId)
    return () => {
      mountedRef.current = false
      const wasExporting = getCameraDirectorState(sceneId).transport.status === 'exporting'
      cancelExport()
      if (getCameraDirectorState(sceneId).transport.status === 'recording') finishRecording()
      currentPoseRef.current = null
      patchTransport(sceneId, {
        status: 'idle',
        currentTime: 0,
        ...(wasExporting ? { message: '导出已取消。', error: null } : {}),
      })
      restore()
      invalidate()
    }
  }, [camera, cancelExport, controls, finishRecording, invalidate, sceneId])

  const stop = useCallback(() => {
    if (!mountedRef.current) return
    const latest = getCameraDirectorState(sceneId)
    if (latest.transport.status === 'recording') {
      finishRecording()
      return
    }
    if (latest.transport.status === 'exporting') {
      cancelExport()
      patchTransport(sceneId, {
        status: 'idle',
        currentTime: 0,
        error: null,
        message: '导出已取消。',
      })
      return
    }
    enableControls(true)
    currentPoseRef.current = null
    patchTransport(sceneId, {
      status: 'idle',
      error: null,
      message: '已停止。',
    })
  }, [cancelExport, enableControls, finishRecording, sceneId])

  const play = useCallback(() => {
    if (!mountedRef.current || exportRef.current) return
    if (getCameraDirectorState(sceneId).transport.status === 'recording') finishRecording()
    const latest = getCameraDirectorState(sceneId)
    const duration = directorDuration(latest)
    const firstPose = sampleDirectorPose(latest, 0)
    if (!firstPose || duration <= 0) {
      patchTransport(sceneId, {
        error: '请先设置起点 A、终点 B，或记录一次手动运镜。',
        message: null,
      })
      return
    }
    const startTime = latest.transport.currentTime >= duration ? 0 : latest.transport.currentTime
    playbackElapsedRef.current = startTime
    lastUiUpdateRef.current = startTime
    currentPoseRef.current = sampleDirectorPose(latest, startTime)!
    emitter.emit('camera-controls:cancel-pose', undefined)
    setCameraPose(camera, controls, currentPoseRef.current, latest.lens.sensorHeightMm)
    enableControls(false)
    patchTransport(sceneId, {
      status: 'playing',
      currentTime: startTime,
      error: null,
      message: latest.sequence.source === 'take' ? '正在回放手动运镜。' : '正在预演起点到终点。',
    })
    invalidate()
  }, [camera, controls, enableControls, finishRecording, invalidate, sceneId])

  const seek = useCallback(
    (time: number) => {
      if (!mountedRef.current || exportRef.current) return
      if (getCameraDirectorState(sceneId).transport.status === 'recording') finishRecording()
      const latest = getCameraDirectorState(sceneId)
      const duration = directorDuration(latest)
      const resolvedTime = Math.min(Math.max(time, 0), duration)
      const pose = sampleDirectorPose(latest, resolvedTime)
      if (!pose) {
        patchTransport(sceneId, {
          error: '当前没有可预览的机位序列。',
          message: null,
        })
        return
      }
      enableControls(true)
      currentPoseRef.current = pose
      emitter.emit('camera-controls:cancel-pose', undefined)
      applyPose(pose)
      patchTransport(sceneId, {
        status: 'idle',
        currentTime: resolvedTime,
        error: null,
        message: null,
      })
    },
    [applyPose, enableControls, finishRecording, sceneId],
  )

  const startRecording = useCallback(() => {
    if (!mountedRef.current || exportRef.current) return
    const latest = getCameraDirectorState(sceneId)
    if (latest.transport.status === 'recording') return
    recordingSamplesRef.current = []
    recordingElapsedRef.current = 0
    nextSampleAtRef.current = 0
    lastUiUpdateRef.current = 0
    emitter.emit('camera-controls:cancel-pose', undefined)
    enableControls(true)
    const first = readCameraPose(camera, controls, latest)
    recordingSamplesRef.current.push({ ...first, time: 0 })
    nextSampleAtRef.current = 1 / latest.take.sampleRate
    patchTransport(sceneId, {
      status: 'recording',
      currentTime: 0,
      error: null,
      message: '正在记录手动运镜；拖动画面调整摄像机视角。',
    })
    invalidate()
  }, [camera, controls, enableControls, invalidate, sceneId])

  const renderPoseAt = useCallback(
    async (
      directorState: CameraDirectorState,
      time: number,
      previousPose: CameraPoseKey | null,
      signal: AbortSignal,
      copy: () => void,
    ) => {
      signal.throwIfAborted()
      const pose = stepRehearsalPose(
        directorState,
        previousPose,
        time,
        1 / directorState.output.fps,
      )
      if (!pose) throw new Error('没有可输出的镜头序列。')
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          frameRef.current = null
          reject(signal.reason ?? cancelled())
        }
        signal.addEventListener('abort', abort, { once: true })
        frameRef.current = {
          pose,
          sensorHeightMm: directorState.lens.sensorHeightMm,
          applied: false,
          copy,
          resolve: () => {
            signal.removeEventListener('abort', abort)
            resolve()
          },
          reject: (error) => {
            signal.removeEventListener('abort', abort)
            reject(error)
          },
        }
        invalidate()
      })
      signal.throwIfAborted()
      return pose
    },
    [invalidate],
  )

  const runCleanExport = useCallback(
    async (operation: (latest: CameraDirectorState, signal: AbortSignal) => Promise<void>) => {
      if (!mountedRef.current || exportRef.current) return
      if (getCameraDirectorState(sceneId).transport.status === 'recording') finishRecording()
      const latest = getCameraDirectorState(sceneId)
      if (!sampleDirectorPose(latest, 0)) {
        patchTransport(sceneId, {
          error: '请先设置起点 A、终点 B，或记录一次手动运镜。',
          message: null,
        })
        return
      }
      const restoreCamera = cameraSnapshot(camera, controls)
      const viewer = useViewer.getState()
      const previousSelection = viewer.selection
      const active = {
        controller: new AbortController(),
        restore: () => {
          restoreCamera()
          useViewer.getState().setSelection(previousSelection)
          invalidate()
        },
      }
      exportRef.current = active
      emitter.emit('camera-controls:cancel-pose', undefined)
      enableControls(false)
      camera.layers.disable(GRID_LAYER)
      viewer.setSelection({ selectedIds: [] })
      patchTransport(sceneId, {
        status: 'exporting',
        currentTime: 0,
        error: null,
        message: '正在准备视频输出。',
      })
      try {
        await operation(latest, active.controller.signal)
      } catch (error) {
        if (mountedRef.current && exportRef.current === active) {
          patchTransport(sceneId, {
            error: error instanceof Error ? error.message : '镜头导出失败。',
            message: null,
          })
        }
      } finally {
        active.controller.abort(cancelled())
        if (mountedRef.current && exportRef.current === active) {
          exportRef.current = null
          active.restore()
          updateCameraDirector(
            sceneId,
            (current) => ({
              ...current,
              transport: {
                ...current.transport,
                status: 'idle',
                currentTime: 0,
              },
            }),
            { persist: false },
          )
        }
      }
    },
    [camera, controls, enableControls, finishRecording, invalidate, sceneId],
  )

  const exportVideo = useCallback(async () => {
    await runCleanExport(async (latest, signal) => {
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('当前浏览器不支持视频录制，请改用 PNG 序列。')
      }
      const duration = directorDuration(latest)
      const destination = outputCanvas(latest.output.width, latest.output.height)
      const context = destination.getContext('2d', { alpha: false })
      if (!context) throw new Error('无法创建视频输出画布。')
      const mimeType = supportedRecorderMimeType()
      const stream = destination.captureStream(latest.output.fps)
      let recorder: MediaRecorder | null = null
      const release = () => {
        if (recorder && recorder.state !== 'inactive') {
          try {
            recorder.stop()
          } catch {
            // A failed encoder must still release every track.
          }
        }
        for (const track of stream.getTracks()) track.stop()
      }
      signal.addEventListener('abort', release, { once: true })
      try {
        signal.throwIfAborted()
        if (stream.getVideoTracks().length === 0) throw new Error('未能创建视频轨道。')
        recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: latest.output.bitrateMbps * 1_000_000,
        })
        const chunks: Blob[] = []
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data)
        }
        const stopped = new Promise<void>((resolve, reject) => {
          recorder!.onstop = () => resolve()
          recorder!.onerror = () => reject(new Error('浏览器视频编码失败。'))
        })
        void stopped.catch(() => {})
        const frameCount = Math.max(2, Math.ceil(duration * latest.output.fps) + 1)
        let startedAt = 0
        let pose = sampleDirectorPose(latest, 0)
        for (let frame = 0; frame < frameCount; frame += 1) {
          const time = Math.min(frame / latest.output.fps, duration)
          pose = await Promise.race([
            renderPoseAt(latest, time, pose, signal, () => {
              drawCover(gl.domElement, destination, context)
              context.getImageData(0, 0, 1, 1)
              if (frame === 0) {
                recorder!.start(250)
                startedAt = performance.now()
              }
            }),
            stopped.then(() => {
              throw new Error('视频录制意外停止。')
            }),
          ])
          signal.throwIfAborted()
          if (frame % Math.max(1, Math.round(latest.output.fps / 4)) === 0) {
            patchTransport(sceneId, {
              currentTime: time,
              message: `视频录制 ${Math.round((frame / (frameCount - 1)) * 100)}%`,
            })
          }
          const targetElapsed = ((frame + 1) / latest.output.fps) * 1000
          await wait(startedAt + targetElapsed - performance.now(), signal)
        }
        recorder.stop()
        await abortable(stopped, signal)
        signal.throwIfAborted()
        const actualMime = recorder.mimeType || chunks[0]?.type || ''
        if (!actualMime.startsWith('video/webm')) throw new Error('浏览器没有返回 WebM 视频。')
        if (chunks.length === 0) throw new Error('未录到视频画面。')
        const blob = new Blob(chunks, { type: actualMime })
        downloadBlob(blob, `咫台-${sceneId}-预演.webm`)
        patchTransport(sceneId, { message: 'WebM 预览已生成并发起下载。', error: null })
      } finally {
        signal.removeEventListener('abort', release)
        if (recorder) {
          recorder.ondataavailable = null
          recorder.onstop = null
          recorder.onerror = null
        }
        release()
      }
    })
  }, [gl.domElement, renderPoseAt, runCleanExport, sceneId])

  const exportPngSequence = useCallback(async () => {
    await runCleanExport(async (latest, signal) => {
      const duration = directorDuration(latest)
      const frameCount = Math.max(2, Math.ceil(duration * latest.output.fps) + 1)
      if (frameCount > 900) {
        throw new Error('逐帧输出超过 900 帧，请缩短时长或降低帧率。')
      }
      const destination = outputCanvas(latest.output.width, latest.output.height)
      const context = destination.getContext('2d', { alpha: false })
      if (!context) throw new Error('无法创建逐帧输出画布。')
      const files: Record<string, Uint8Array> = {}
      let pose = sampleDirectorPose(latest, 0)
      for (let frame = 0; frame < frameCount; frame += 1) {
        const time = Math.min(frame / latest.output.fps, duration)
        pose = await renderPoseAt(latest, time, pose, signal, () =>
          drawCover(gl.domElement, destination, context),
        )
        const blob = await abortable(canvasToPng(destination), signal)
        const bytes = await abortable(blob.arrayBuffer(), signal)
        signal.throwIfAborted()
        files[`frames/zhitai_${padFrame(frame)}.png`] = new Uint8Array(bytes)
        if (frame % Math.max(1, Math.round(latest.output.fps / 4)) === 0) {
          patchTransport(sceneId, {
            currentTime: time,
            message: `逐帧渲染 ${Math.round((frame / (frameCount - 1)) * 100)}%`,
          })
        }
      }
      const { strToU8, zip } = await abortable(import('fflate'), signal)
      signal.throwIfAborted()
      files['sequence.json'] = strToU8(
        JSON.stringify(
          {
            sceneId,
            width: latest.output.width,
            height: latest.output.height,
            fps: latest.output.fps,
            duration,
            frames: frameCount,
            source: latest.sequence.source,
            lens: latest.lens,
          },
          null,
          2,
        ),
      )
      patchTransport(sceneId, { message: '正在封装 PNG 序列…' })
      const archive = await new Promise<Uint8Array>((resolve, reject) => {
        const terminate = zip(files, { level: 0 }, (error, data) => {
          signal.removeEventListener('abort', abort)
          if (error) reject(error)
          else resolve(data)
        })
        const abort = () => {
          terminate()
          reject(signal.reason ?? cancelled())
        }
        signal.addEventListener('abort', abort, { once: true })
      })
      signal.throwIfAborted()
      downloadBlob(
        new Blob([new Uint8Array(archive)], { type: 'application/zip' }),
        `咫台-${sceneId}-逐帧图片.zip`,
      )
      patchTransport(sceneId, { message: 'PNG 逐帧图片已生成并发起下载。', error: null })
    })
  }, [gl.domElement, renderPoseAt, runCleanExport, sceneId])

  useEffect(
    () =>
      registerCameraDirectorRuntime(sceneId, {
        captureKey,
        focusSelection,
        play,
        stop,
        seek,
        startRecording,
        stopRecording: finishRecording,
        exportVideo,
        exportPngSequence,
      }),
    [
      captureKey,
      exportPngSequence,
      exportVideo,
      finishRecording,
      focusSelection,
      play,
      sceneId,
      seek,
      startRecording,
      stop,
    ],
  )

  useFrame((_frameState, delta) => {
    if (!mountedRef.current) return
    const frame = frameRef.current
    if (frame) {
      setCameraPose(camera, controls, frame.pose, frame.sensorHeightMm)
      frame.applied = true
      return
    }
    const latest = getCameraDirectorState(sceneId)
    if (latest.transport.status === 'playing') {
      const duration = directorDuration(latest)
      const nextTime = Math.min(playbackElapsedRef.current + Math.min(delta, 0.25), duration)
      playbackElapsedRef.current = nextTime
      const applied = stepRehearsalPose(latest, currentPoseRef.current, nextTime, delta)
      if (applied) {
        currentPoseRef.current = applied
        setCameraPose(camera, controls, applied, latest.lens.sensorHeightMm)
      }
      if (nextTime - lastUiUpdateRef.current >= 0.1 || nextTime >= duration) {
        lastUiUpdateRef.current = nextTime
        patchTransport(sceneId, { currentTime: nextTime })
      }
      if (nextTime >= duration) {
        enableControls(true)
        currentPoseRef.current = null
        patchTransport(sceneId, {
          status: 'idle',
          currentTime: duration,
          message: '序列播放完成。',
        })
      } else {
        invalidate()
      }
      return
    }

    if (latest.transport.status === 'recording') {
      recordingElapsedRef.current += Math.min(delta, 0.25)
      const sampleInterval = 1 / latest.take.sampleRate
      while (nextSampleAtRef.current <= recordingElapsedRef.current) {
        const pose = readCameraPose(camera, controls, latest)
        recordingSamplesRef.current.push({ ...pose, time: nextSampleAtRef.current })
        nextSampleAtRef.current += sampleInterval
      }
      if (recordingElapsedRef.current - lastUiUpdateRef.current >= 0.1) {
        lastUiUpdateRef.current = recordingElapsedRef.current
        patchTransport(sceneId, { currentTime: recordingElapsedRef.current })
      }
      if (recordingElapsedRef.current >= 60) finishRecording()
      else invalidate()
    }
  }, 0.9)

  if (!state.output.safeFrame || state.transport.status === 'exporting') return null

  const outputAspect = state.output.width / state.output.height
  const viewportAspect = size.width / Math.max(size.height, 1)
  return (
    <Html fullscreen style={{ pointerEvents: 'none' }} zIndexRange={[12, 12]}>
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="relative border border-white/45 shadow-[0_0_0_200vmax_rgba(0,0,0,0.16)]"
            style={{
              width: `${Math.min(1, outputAspect / viewportAspect) * 100}%`,
              height: `${Math.min(1, viewportAspect / outputAspect) * 100}%`,
            }}
          >
            <span className="absolute top-2 left-2 rounded bg-black/45 px-1.5 py-1 font-mono text-[9px] text-white/75 backdrop-blur-sm">
              {rigLabels[state.rig.type]} · {state.lens.focalLengthMm.toFixed(0)} 毫米 · f/
              {state.lens.aperture.toFixed(1)}
            </span>
            <span className="absolute right-2 bottom-2 rounded bg-black/45 px-1.5 py-1 font-mono text-[9px] text-white/75 backdrop-blur-sm">
              {state.output.width}×{state.output.height} · {state.output.fps} 帧/秒
            </span>
            <div className="absolute top-1/2 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/35" />
          </div>
        </div>
      </div>
    </Html>
  )
}
