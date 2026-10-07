'use client'

import { emitter, useLiveTransforms, useScene } from '@pascal-app/core'
import { type SnapshotCameraData, useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PerspectiveCamera } from 'three'
import { sceneGraphSignature } from '@/lib/scene-signature'
import { audienceObservationPose } from '@/lib/theatre/presentation'
import { readStageDocument } from '@/lib/theatre/simulation-store'
import { createUUID } from '@/lib/uuid'

type CoverRequest = { sceneId: string; version: number; signature: string }
type CaptureResult = { blob?: Blob; error?: string }

export function useAudienceCover({ sceneId, ready }: { sceneId: string; ready: boolean }) {
  const [request, setRequest] = useState<CoverRequest | null>(null)
  const pending = useRef<{ id: string; finish: (result: CaptureResult) => void } | null>(null)
  const scheduleCover = useCallback(
    (next: Omit<CoverRequest, 'sceneId'>) => setRequest({ ...next, sceneId }),
    [sceneId],
  )
  const onThumbnailCapture = useCallback((blob: Blob, camera: SnapshotCameraData) => {
    if (camera.requestId === pending.current?.id) pending.current?.finish({ blob })
  }, [])

  useEffect(() => {
    if (!ready || !request || request.sceneId !== sceneId) return
    let cancelled = false
    let activeId: string | null = null
    const upload = new AbortController()
    const fresh = () => {
      if (cancelled || useLiveTransforms.getState().transforms.size > 0) return false
      const editor = useEditor.getState()
      if (editor.isPreviewMode || editor.isCaptureMode) return false
      return sceneGraphSignature(useScene.getState()) === request.signature
    }

    const capture = async (attempt = 0) => {
      try {
        if (!fresh()) return
        const document = readStageDocument()
        const projectId = useViewer.getState().projectId
        if (!document || !projectId) return
        const camera = new PerspectiveCamera(50, 16 / 9)
        const pose = audienceObservationPose(document.venue, camera.fov, camera.aspect)
        camera.position.fromArray(pose.position)
        camera.lookAt(...pose.target)
        const result = await new Promise<CaptureResult>((resolve) => {
          const requestId = createUUID()
          activeId = requestId
          const finish = (result: CaptureResult) => {
            clearTimeout(timeout)
            emitter.off('snapshot:capture-failed', failed)
            if (pending.current?.id === requestId) pending.current = null
            resolve(result)
          }
          const failed = (failure: { requestId: string; error: string }) => {
            if (failure.requestId === requestId) finish({ error: failure.error })
          }
          const timeout = setTimeout(() => finish({ error: 'capture_timeout' }), 10_000)
          pending.current = { id: requestId, finish }
          emitter.on('snapshot:capture-failed', failed)
          emitter.emit('camera-controls:generate-thumbnail', {
            projectId,
            requestId,
            cameraPose: {
              position: pose.position,
              quaternion: camera.quaternion.toArray(),
              fov: camera.fov,
            },
            captureMode: 'standard',
            standardSize: { w: 1920, h: 1080 },
          })
        })
        if (!fresh()) return
        const blob = result.blob
        if (!blob) {
          if (attempt === 0 && /尚未就绪/.test(result.error ?? ''))
            timer = setTimeout(() => void capture(1), 800)
          return
        }
        const thumbnailUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onerror = () => reject(reader.error)
          reader.onload = () =>
            typeof reader.result === 'string'
              ? resolve(reader.result)
              : reject(new Error('封面编码失败'))
          reader.readAsDataURL(blob)
        })
        if (!fresh()) return
        const post = async (attempt = 0) => {
          if (!fresh()) return
          const response = await fetch(`/api/scenes/${sceneId}/thumbnail`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ thumbnailUrl, expectedVersion: request.version }),
            signal: AbortSignal.any([upload.signal, AbortSignal.timeout(10_000)]),
          })
          if (!response.ok && response.status >= 500 && attempt === 0 && fresh())
            timer = setTimeout(() => void post(1).catch(() => {}), 800)
        }
        await post()
      } catch {
        // A replaceable cover must never interrupt saving the actual stage.
        if (pending.current?.id === activeId) pending.current?.finish({ error: 'capture_failed' })
      }
    }
    let timer = setTimeout(() => void capture(), 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
      upload.abort()
      if (pending.current?.id === activeId) pending.current?.finish({ error: 'cancelled' })
    }
  }, [ready, request, sceneId])

  return { onThumbnailCapture, scheduleCover }
}
