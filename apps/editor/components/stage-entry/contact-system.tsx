'use client'

import { getNodeLock, sceneRegistry, useScene } from '@pascal-app/core'
import { prepareStageCollision, stageLayoutObjects } from '@pascal-app/core/stage'
import { useEditor } from '@pascal-app/editor'
import { useIsolatedFrame as useFrame, useViewer } from '@pascal-app/viewer'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { useStageContactFeedback } from '@/lib/stage/contact-feedback'
import { stageContactIds } from '@/lib/stage/contacts'
import { useLiveStageContext } from '@/lib/stage/live-context'
import { stageModelBottom } from '@/lib/stage/model-contact'
import { useStagePlanPreview } from '@/lib/stage/plan-preview'
import { useSimulationSelection } from '../theatre/simulation-panel'
import { createStageContactOverlay } from './contact-overlay'
import { placementPlan, useStagePlacement } from './manual-stage-panel'

export function StageContactSystem({ enabled }: { enabled: boolean }) {
  const scene = useLiveStageContext()
  const plan = useStagePlanPreview((state) => state.draft ?? state.plan)
  const placement = useStagePlacement((state) => state.draft)
  const showGhost = useSimulationSelection((state) => state.showGhost)
  const exporting = useViewer((state) => state.isExporting)
  const canvas = useThree((state) => state.gl.domElement)
  const overlay = useMemo(createStageContactOverlay, [])
  const selectionOverlay = useMemo(() => createStageContactOverlay(true), [])
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const nodes = useScene((state) => state.nodes)
  const editing = useEditor(
    (state) => !state.isPreviewMode && !state.isFirstPersonMode && !state.isCaptureMode,
  )
  const selected = useMemo(
    () =>
      new Set(
        enabled && !exporting && editing
          ? selectedIds.filter(
              (id) =>
                scene.objects.some((object) => object.id === id) && !getNodeLock(nodes, id, true),
            )
          : [],
      ),
    [enabled, exporting, editing, selectedIds, nodes, scene.objects],
  )
  const contacts = useMemo(() => {
    if (!enabled || exporting) return new Set<string>()
    const visiblePlan = showGhost ? plan : null
    const layout = placement
      ? {
          ...(visiblePlan ?? placementPlan(placement)),
          items: [
            ...(visiblePlan?.items.filter(
              (item) =>
                !placement.item.existingNodeId ||
                item.existingNodeId !== placement.item.existingNodeId,
            ) ?? []),
            {
              ...placement.item,
              transform: {
                ...placement.item.transform,
                position: {
                  ...placement.item.transform.position,
                  z:
                    placement.item.transform.position.z +
                    (visiblePlan?.venue && scene.venue
                      ? (visiblePlan.venue.depthMeters - scene.venue.depthMeters) / 2
                      : 0),
                },
              },
            },
          ],
        }
      : visiblePlan
    return stageContactIds(stageLayoutObjects(scene, layout), true)
  }, [enabled, exporting, scene, plan, placement, showGhost])
  useEffect(() => {
    const objects = scene.objects.filter((object) => selected.has(object.id))
    const penetrating = objects.some((object) => contacts.has(object.id))
    const mates = penetrating
      ? []
      : scene.objects.filter(
          (other) =>
            !selected.has(other.id) &&
            objects.some((object) => stageContactIds([object, other]).has(object.id)),
        )
    const floorContact = objects.some(
      (object) =>
        Math.abs(
          (stageModelBottom(object) ??
            prepareStageCollision(object).bounds[1]![0] - object.transform.position.y) +
            object.transform.position.y,
        ) < 1e-6,
    )
    const touching = mates.length > 0 || floorContact
    const kind = penetrating ? 'penetration' : touching ? 'contact' : 'none'
    const previous = useStageContactFeedback.getState()
    const contactKey = JSON.stringify([mates.map((object) => object.id).sort(), floorContact])
    const signature = JSON.stringify([
      scene.documentVersion,
      objects.map((object) => [object.id, object.transform, object.dimensionsMeters]),
      kind,
    ])
    useStageContactFeedback.setState({
      kind,
      signature,
      contactKey,
      message: penetrating
        ? '存在穿模、地面穿透或预演重叠；确认布局不会消除此提示。'
        : touching
          ? `${mates.length ? mates.map((object) => object.name).join('、') : '舞台地面'}：已贴合 · 间距 0（数值容差内）`
          : objects.length
            ? '未贴合 · 可继续调整'
            : '',
    })
    if (
      kind === 'contact' &&
      (previous.kind !== 'contact' || previous.contactKey !== contactKey) &&
      useViewer.getState().inputDragging &&
      useStagePlacement.getState().snap.guides &&
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    ) {
      navigator.vibrate(12)
    }
  }, [scene, selected, contacts])
  useFrame(() => {
    overlay.sync(contacts, sceneRegistry.nodes, useViewer.getState().geometryRevision, contacts)
    selectionOverlay.sync(
      selected,
      sceneRegistry.nodes,
      useViewer.getState().geometryRevision,
      scene,
    )
    canvas.dataset.stageSelectedIds = JSON.stringify(selectionOverlay.group.userData.contactIds)
    const ids = overlay.group.userData.contactIds as string[]
    const value = JSON.stringify(ids)
    if (canvas.dataset.stageContactIds !== value) {
      canvas.dataset.stageContactIds = value
      canvas.dataset.stageContactCount = String(ids.length)
    }
  }, 4)
  useEffect(
    () => () => {
      overlay.dispose()
      selectionOverlay.dispose()
      delete canvas.dataset.stageSelectedIds
      delete canvas.dataset.stageContactIds
      delete canvas.dataset.stageContactCount
    },
    [overlay, selectionOverlay, canvas],
  )
  return (
    <>
      <primitive dispose={null} object={overlay.group} />
      <primitive dispose={null} object={selectionOverlay.group} />
    </>
  )
}
