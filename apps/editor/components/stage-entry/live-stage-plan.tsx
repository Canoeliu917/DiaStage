'use client'

import { getNodeLock, useScene } from '@pascal-app/core'
import { compileStagePlan, type StagePlan, validateStagePlan } from '@pascal-app/core/stage'
import { useEditor, useInteractionScope } from '@pascal-app/editor'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { commandMeta, executeStageCommands } from '@/lib/stage/command-executor'
import { currentStageContext } from '@/lib/stage/context'
import { useLiveStageContext } from '@/lib/stage/live-context'
import { snapStageObject } from '@/lib/stage/placement-snap'
import { useStagePlanPreview, withoutPlanTransforms } from '@/lib/stage/plan-preview'
import { useStagePlacement } from './manual-stage-panel'
import { existingProposal, PlanDrawing } from './plan-review'

const EMPTY_PLAN: StagePlan = {
  schemaVersion: 1,
  source: 'manual',
  venue: null,
  items: [],
  relations: [],
  assumptions: [],
  questions: [],
  evidence: [],
  warnings: [],
}
const endMove = () =>
  useInteractionScope
    .getState()
    .endIf((scope) => scope.kind === 'drafting' && scope.tool === 'diastage-live-plan')

export const LiveStagePlan = memo(function LiveStagePlan() {
  const scene = useLiveStageContext()
  const context = useMemo(
    () => ({
      ...scene,
      objects: scene.objects.filter(
        (item) => item.kind !== 'camera' && item.kind !== 'performer-marker',
      ),
    }),
    [scene],
  )
  const readOnly = useScene((state) => state.readOnly)
  const editing = useEditor(
    (state) => !state.isCaptureMode && !state.isFirstPersonMode && !state.isPreviewMode,
  )
  const dragPlan = useRef<StagePlan | null>(null)
  const dragContext = useRef<ReturnType<typeof currentStageContext> | null>(null)
  const cancel = useCallback(() => {
    if (dragPlan.current && useStagePlanPreview.getState().draft === dragPlan.current) {
      useStagePlanPreview.getState().restoreExisting?.()
      useStagePlanPreview.setState({ draft: null })
    }
    dragPlan.current = null
    dragContext.current = null
    endMove()
  }, [])
  useEffect(() => cancel, [cancel])
  useEffect(() => {
    if (readOnly || !editing) cancel()
  }, [readOnly, editing, cancel])
  const plan = useMemo(
    () =>
      validateStagePlan(
        { ...EMPTY_PLAN, items: context.objects.map((item) => existingProposal(item)) },
        context,
      ).plan,
    [context],
  )
  const move = (id: string, x: number, z: number, commit: boolean) => {
    if (readOnly || !editing || getNodeLock(useScene.getState().nodes, id, true)) return
    const formal = dragContext.current ?? currentStageContext()
    const object = formal.objects.find((item) => item.id === id)
    if (!object) return
    const item = existingProposal(object)
    item.transform = {
      ...item.transform,
      position: snapStageObject(
        { x, y: item.transform.position.y, z },
        object,
        formal,
        useStagePlacement.getState().snap,
      ).position,
    }
    const next = validateStagePlan({ ...EMPTY_PLAN, items: [item] }, formal).plan
    if (!commit) {
      if (!dragPlan.current) {
        useInteractionScope.getState().begin({ kind: 'drafting', tool: 'diastage-live-plan' })
        dragContext.current = formal
      }
      dragPlan.current = next
      useStagePlanPreview.setState({ draft: next })
    } else
      void withoutPlanTransforms(() => {
        endMove()
        const compiled = compileStagePlan(next, currentStageContext(), commandMeta())
        if (compiled.ok) executeStageCommands(compiled.commands)
        cancel()
      })
  }
  return (
    <>
      <h2>Dia预演：</h2>
      <PlanDrawing
        plan={plan}
        context={context}
        onMove={move}
        onCancel={cancel}
        disabled={readOnly || !editing}
        live
      />
    </>
  )
})
