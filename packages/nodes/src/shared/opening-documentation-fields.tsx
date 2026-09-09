'use client'

import { getLinearUnitLabel, linearUnitToMeters, metersToLinearUnit } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'

type OpeningDocumentationPatch = {
  mark?: string
  constructionType?: 'framed' | 'masonry'
  dimensionReference?: 'nominal' | 'rough-opening' | 'masonry-opening' | 'finish-opening'
  roughOpeningWidth?: number
  roughOpeningHeight?: number
  masonryOpeningWidth?: number
  masonryOpeningHeight?: number
  finishOpeningWidth?: number
  finishOpeningHeight?: number
}

export function OpeningDocumentationFields({
  mark,
  constructionType = 'framed',
  dimensionReference = 'nominal',
  roughOpeningWidth,
  roughOpeningHeight,
  masonryOpeningWidth,
  masonryOpeningHeight,
  finishOpeningWidth,
  finishOpeningHeight,
  onChange,
}: OpeningDocumentationPatch & {
  onChange: (patch: OpeningDocumentationPatch) => void
}) {
  return (
    <div className="flex flex-col gap-2 px-1 pb-1">
      <label className="flex flex-col gap-1">
        <span className="font-medium text-[10px] text-muted-foreground/80 uppercase tracking-wider">
          标记
        </span>
        <input
          className="h-8 rounded-lg border border-border/50 bg-[#2C2C2E] px-2.5 font-mono text-foreground text-xs outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-orange-400/60"
          defaultValue={mark ?? ''}
          key={`mark:${mark ?? ''}`}
          maxLength={16}
          onBlur={(event) => {
            const next = event.currentTarget.value.trim().toLocaleUpperCase()
            if (next !== (mark ?? '')) onChange({ mark: next || undefined })
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              event.currentTarget.value = mark ?? ''
              event.currentTarget.blur()
            }
          }}
          placeholder="自动分配"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-medium text-[10px] text-muted-foreground/80 uppercase tracking-wider">
            构造
          </span>
          <select
            className="h-8 rounded-lg border border-border/50 bg-[#2C2C2E] px-2 text-foreground text-xs outline-none focus:border-orange-400/60"
            onChange={(event) => {
              const next = event.currentTarget.value as 'framed' | 'masonry'
              onChange({
                constructionType: next,
                dimensionReference:
                  next === 'masonry' && dimensionReference === 'nominal'
                    ? 'masonry-opening'
                    : dimensionReference,
              })
            }}
            value={constructionType}
          >
            <option value="framed">框架式</option>
            <option value="masonry">砌筑式</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-[10px] text-muted-foreground/80 uppercase tracking-wider">
            标注基准
          </span>
          <select
            className="h-8 rounded-lg border border-border/50 bg-[#2C2C2E] px-2 text-foreground text-xs outline-none focus:border-orange-400/60"
            onChange={(event) =>
              onChange({
                dimensionReference: event.currentTarget
                  .value as OpeningDocumentationPatch['dimensionReference'],
              })
            }
            value={dimensionReference}
          >
            <option value="nominal">名义尺寸</option>
            <option value="rough-opening">预留洞口</option>
            <option value="masonry-opening">砌体洞口</option>
            <option value="finish-opening">完成面洞口</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <OptionalMeterInput
          label="预留洞口宽度"
          onChange={(value) => onChange({ roughOpeningWidth: value })}
          value={roughOpeningWidth}
        />
        <OptionalMeterInput
          label="预留洞口高度"
          onChange={(value) => onChange({ roughOpeningHeight: value })}
          value={roughOpeningHeight}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <OptionalMeterInput
          label="砌体洞口宽度"
          onChange={(value) => onChange({ masonryOpeningWidth: value })}
          value={masonryOpeningWidth}
        />
        <OptionalMeterInput
          label="砌体洞口高度"
          onChange={(value) => onChange({ masonryOpeningHeight: value })}
          value={masonryOpeningHeight}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <OptionalMeterInput
          label="完成面洞口宽度"
          onChange={(value) => onChange({ finishOpeningWidth: value })}
          value={finishOpeningWidth}
        />
        <OptionalMeterInput
          label="完成面洞口高度"
          onChange={(value) => onChange({ finishOpeningHeight: value })}
          value={finishOpeningHeight}
        />
      </div>
      <p className="px-0.5 text-[10px] text-muted-foreground/65 leading-4">
        预留洞口、砌体洞口与完成面洞口尺寸应在制造商或相关专业确认后填写。
      </p>
    </div>
  )
}

function OptionalMeterInput({
  label,
  value,
  onChange,
}: {
  label: string
  value?: number
  onChange: (value: number | undefined) => void
}) {
  const unit = useViewer((state) => state.unit)
  const displayValue = value === undefined ? '' : roundForInput(metersToLinearUnit(value, unit))

  return (
    <label className="flex flex-col gap-1">
      <span className="font-medium text-[10px] text-muted-foreground/80 uppercase tracking-wider">
        {label}
      </span>
      <div className="flex h-8 items-center rounded-lg border border-border/50 bg-[#2C2C2E] focus-within:border-orange-400/60">
        <input
          className="min-w-0 flex-1 bg-transparent px-2 font-mono text-foreground text-xs outline-none placeholder:text-muted-foreground/50"
          defaultValue={displayValue}
          key={`${label}:${displayValue}`}
          min={0.01}
          onBlur={(event) => {
            const raw = event.currentTarget.value
            if (raw === String(displayValue)) return
            const parsed = Number.parseFloat(raw)
            const next =
              raw === '' || !Number.isFinite(parsed) || parsed <= 0
                ? undefined
                : linearUnitToMeters(parsed, unit)
            if (next !== value) onChange(next)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              event.currentTarget.value = String(displayValue)
              event.currentTarget.blur()
            }
          }}
          onWheel={(event) => event.currentTarget.blur()}
          placeholder="核验"
          step={unit === 'imperial' ? 0.01 : 0.001}
          type="number"
        />
        <span className="pr-2 font-mono text-[10px] text-muted-foreground">
          {getLinearUnitLabel(unit)}
        </span>
      </div>
    </label>
  )
}

function roundForInput(value: number): number {
  return Math.round(value * 1000) / 1000
}
