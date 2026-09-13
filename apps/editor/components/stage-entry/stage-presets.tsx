'use client'

import { useScene } from '@pascal-app/core'
import { compileStagePlan, type StagePlan } from '@pascal-app/core/stage'
import { useEffect, useRef, useState } from 'react'
import { commandMeta, executeStageCommands } from '@/lib/stage/command-executor'
import { currentStageContext } from '@/lib/stage/context'
import { useStagePlanPreview } from '@/lib/stage/plan-preview'
import { createStagePreset, STAGE_PRESETS } from '@/lib/stage/stage-presets'
import { StagePlanReview } from './plan-review'

export function StagePresets() {
  const readOnly = useScene((state) => state.readOnly)
  const [plan, setPlan] = useState<StagePlan | null>(null)
  const [notice, setNotice] = useState('')
  const preview = useRef<StagePlan | null>(null)
  useEffect(
    () => () => {
      if (preview.current && useStagePlanPreview.getState().plan === preview.current)
        useStagePlanPreview.setState({ plan: null })
    },
    [],
  )
  return (
    <details className="stage-presets">
      <summary>搭景预设 · 22 件标准资产</summary>
      {STAGE_PRESETS.map((preset, index) => (
        <button
          type="button"
          key={preset.name}
          disabled={readOnly}
          onClick={() => {
            try {
              setPlan(createStagePreset(index, currentStageContext()))
              setNotice('')
            } catch (error) {
              setNotice(String(error))
            }
          }}
        >
          <strong>{preset.name}</strong>
          <small>{preset.description}</small>
        </button>
      ))}
      {plan && (
        <StagePlanReview
          compact
          plan={plan}
          context={currentStageContext()}
          onChange={setPlan}
          onPreview={(next) => {
            preview.current = next
            useStagePlanPreview.setState({ plan: next })
          }}
          onConfirm={(next) => {
            const compiled = compileStagePlan(next, currentStageContext(), commandMeta('manual'))
            if (!compiled.ok) {
              setNotice([...new Set(compiled.warnings.map((entry) => entry.message))].join(' '))
              return
            }
            const result = executeStageCommands(compiled.commands)
            if (result.ok) {
              setPlan(null)
              useStagePlanPreview.setState({ plan: null })
              setNotice('已放到舞台上，可撤销。')
            } else setNotice(result.error ?? '未完成，请调整后重试。')
          }}
          onBack={() => {
            setPlan(null)
            useStagePlanPreview.setState({ plan: null })
          }}
          busy={readOnly}
        />
      )}
      {notice && <p role="status">{notice}</p>}
    </details>
  )
}
