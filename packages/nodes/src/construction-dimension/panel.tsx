'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type ConstructionDimensionDatumPolicy,
  type ConstructionDimensionDrawingPresentation,
  type ConstructionDimensionImperialPrecision,
  type ConstructionDimensionMetricNotation,
  type ConstructionDimensionNode,
  type ConstructionDimensionTerminator,
  type ConstructionDimensionTextPosition,
  type ConstructionDrawingType,
  resolveConstructionDimensionDrawingOverride,
  resolveConstructionDimensionDrawingPresentation,
  setConstructionDimensionDrawingPresentation,
  setConstructionDimensionDrawingSuppressedSegments,
  useScene,
} from '@pascal-app/core'
import {
  ActionButton,
  ActionGroup,
  DRAWING_TYPE_OPTIONS,
  PanelSection,
  PanelWrapper,
  SliderControl,
  triggerSFX,
  useDrawingView,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

const MODE_LABELS: Record<ConstructionDimensionNode['mode'], string> = {
  linear: '线性',
  radius: '半径',
  diameter: '直径',
  'center-mark': '中心标记',
  chord: '弦长',
  'arc-length': '弧长',
  angular: '角度',
  coordinate: '坐标',
}

const DATUM_POLICY_OPTIONS: Array<{ label: string; value: ConstructionDimensionDatumPolicy }> = [
  { label: '中心线', value: 'centerline' },
  { label: '墙面', value: 'wall-face' },
  { label: '结构面', value: 'structural-face' },
  { label: '完成面', value: 'finish-face' },
]

const TERMINATOR_OPTIONS: Array<{ label: string; value: ConstructionDimensionTerminator }> = [
  { label: '建筑斜线', value: 'architectural-tick' },
  { label: '实心箭头', value: 'filled-arrow' },
  { label: '空心箭头', value: 'open-arrow' },
  { label: '圆点', value: 'dot' },
]

const TEXT_POSITION_OPTIONS: Array<{ label: string; value: ConstructionDimensionTextPosition }> = [
  { label: '在线上方', value: 'above' },
  { label: '在线上居中', value: 'centered' },
]

const IMPERIAL_PRECISION_OPTIONS: Array<{
  label: string
  value: ConstructionDimensionImperialPrecision
}> = [
  { label: '精确至整英寸', value: '1' },
  { label: '精确至 1/2 英寸', value: '1/2' },
  { label: '精确至 1/4 英寸', value: '1/4' },
  { label: '精确至 1/8 英寸', value: '1/8' },
  { label: '精确至 1/16 英寸', value: '1/16' },
]

const METRIC_NOTATION_OPTIONS: Array<{
  label: string
  value: ConstructionDimensionMetricNotation
}> = [
  { label: '米', value: 'meters' },
  { label: '毫米', value: 'millimeters' },
]

export default function ConstructionDimensionPanel() {
  const selectedId = useViewer((state) => state.selection.selectedIds[0])
  const setSelection = useViewer((state) => state.setSelection)
  const dimension = useScene((state) => {
    const node = selectedId ? state.nodes[selectedId as AnyNodeId] : undefined
    return node?.type === 'construction-dimension' ? node : null
  })
  const updateNode = useScene((state) => state.updateNode)
  const deleteNode = useScene((state) => state.deleteNode)
  const activeDrawingType = useDrawingView((state) => state.drawingType)

  if (!(dimension && selectedId)) return null
  const update = (patch: Partial<ConstructionDimensionNode>) => updateNode(dimension.id, patch)
  const supportsCenterMark = ['radius', 'diameter', 'arc-length', 'angular'].includes(
    dimension.mode,
  )
  const activeDrawingLabel =
    DRAWING_TYPE_OPTIONS.find((option) => option.id === activeDrawingType)?.label ?? 'Floor plan'
  const activePresentation = resolveConstructionDimensionDrawingPresentation(
    dimension,
    activeDrawingType,
  )
  const activeDrawingOverride = resolveConstructionDimensionDrawingOverride(
    dimension,
    activeDrawingType,
  )
  const suppressedSegmentsText = formatSuppressedSegments(
    activeDrawingOverride?.suppressedSegmentIndexes ?? [],
  )
  const updateDrawingPresentation = (
    drawingType: ConstructionDrawingType,
    presentation: ConstructionDimensionDrawingPresentation,
  ) => {
    const drawingOverrides = setConstructionDimensionDrawingPresentation(
      dimension,
      drawingType,
      presentation,
    )
    const firstFoundationController =
      presentation === 'controlled' && !dimension.controllingDimensionId
        ? selectFoundationControllers(useScene.getState().nodes, dimension.id)[0]
        : undefined
    update({
      drawingOverrides,
      ...(presentation === 'controlled' && !dimension.controllingDimensionId
        ? { controllingDimensionId: firstFoundationController?.id ?? null }
        : {}),
    })
  }
  const updateSuppressedSegments = (value: string) => {
    update({
      drawingOverrides: setConstructionDimensionDrawingSuppressedSegments(
        dimension,
        activeDrawingType,
        parseSuppressedSegments(value),
      ),
    })
  }

  return (
    <PanelWrapper
      icon="/icons/blueprint.webp"
      onClose={() => setSelection({ selectedIds: [] })}
      title="建筑尺寸标注"
      width={320}
    >
      <PanelSection title="尺寸标注">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">模式</span>
          <span className="font-medium text-foreground">{MODE_LABELS[dimension.mode]}</span>
        </div>
        <SliderControl
          label="特征数量"
          max={999}
          min={1}
          onChange={(featureCount) => update({ featureCount })}
          precision={0}
          step={1}
          value={dimension.featureCount}
        />
        {supportsCenterMark ? (
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">中心标记</span>
            <input
              checked={dimension.showCenterMark}
              onChange={(event) => update({ showCenterMark: event.target.checked })}
              type="checkbox"
            />
          </label>
        ) : null}
      </PanelSection>

      <PanelSection title="图纸协调">
        <SelectField
          label="主图纸"
          onChange={(drawingType) =>
            update({ drawingType: drawingType as ConstructionDrawingType })
          }
          options={DRAWING_TYPE_OPTIONS.map((option) => ({
            label: option.label,
            value: option.id,
          }))}
          value={dimension.drawingType}
        />
        <SelectField
          label={`${activeDrawingLabel}显示`}
          onChange={(presentation) =>
            updateDrawingPresentation(
              activeDrawingType,
              presentation as ConstructionDimensionDrawingPresentation,
            )
          }
          options={[
            { label: '显示', value: 'shown' },
            { label: '省略', value: 'omit' },
            ...(activeDrawingType === 'floor-plan'
              ? [{ label: '由基础控制', value: 'controlled' }]
              : []),
          ]}
          value={activePresentation}
        />
        {activeDrawingType === 'floor-plan' && activePresentation === 'controlled' ? (
          <FoundationControllerField
            dimensionId={dimension.id}
            onChange={(controllingDimensionId) =>
              update({
                controllingDimensionId,
              })
            }
            value={dimension.controllingDimensionId ?? ''}
          />
        ) : null}
        <p className="text-muted-foreground text-xs">
          关联尺寸复用控制对象的关联锚点，并随其更新。
        </p>
        <TextField
          label={`${activeDrawingLabel}隐藏分段`}
          onCommit={updateSuppressedSegments}
          placeholder="例如：2、4"
          value={suppressedSegmentsText}
        />
        <p className="text-muted-foreground text-xs">分段编号从 1 开始，仅应用于当前图纸视图。</p>
      </PanelSection>

      <PanelSection title="标注格式">
        <TextField
          label="前缀"
          onCommit={(prefix) => update({ prefix })}
          value={dimension.prefix}
        />
        <TextField
          label="后缀"
          onCommit={(suffix) => update({ suffix })}
          value={dimension.suffix}
        />
        <TextField
          label="替代文本"
          onCommit={(textOverride) => update({ textOverride: textOverride || null })}
          placeholder="使用测量值"
          value={dimension.textOverride ?? ''}
        />
      </PanelSection>

      <PanelSection title="标准">
        <SelectField
          label="基准规则"
          onChange={(datumPolicy) =>
            update({ datumPolicy: datumPolicy as ConstructionDimensionDatumPolicy })
          }
          options={DATUM_POLICY_OPTIONS}
          value={dimension.datumPolicy}
        />
        <SelectField
          label="端点符号"
          onChange={(terminator) =>
            update({ terminator: terminator as ConstructionDimensionTerminator })
          }
          options={TERMINATOR_OPTIONS}
          value={dimension.terminator}
        />
        <SelectField
          label="文字位置"
          onChange={(textPosition) =>
            update({ textPosition: textPosition as ConstructionDimensionTextPosition })
          }
          options={TEXT_POSITION_OPTIONS}
          value={dimension.textPosition}
        />
        <SelectField
          label="英制精度"
          onChange={(imperialPrecision) =>
            update({
              imperialPrecision: imperialPrecision as ConstructionDimensionImperialPrecision,
            })
          }
          options={IMPERIAL_PRECISION_OPTIONS}
          value={dimension.imperialPrecision}
        />
        <SelectField
          label="公制标注"
          onChange={(metricNotation) =>
            update({ metricNotation: metricNotation as ConstructionDimensionMetricNotation })
          }
          options={METRIC_NOTATION_OPTIONS}
          value={dimension.metricNotation}
        />
        <SliderControl
          label="界线间隙"
          max={0.5}
          min={0}
          onChange={(extensionStartGap) => update({ extensionStartGap })}
          precision={3}
          step={0.005}
          value={dimension.extensionStartGap}
        />
        <SliderControl
          label="界线超出长度"
          max={0.5}
          min={0}
          onChange={(extensionOvershoot) => update({ extensionOvershoot })}
          precision={3}
          step={0.005}
          value={dimension.extensionOvershoot}
        />
      </PanelSection>

      <PanelSection title="操作">
        <ActionGroup>
          <ActionButton
            className="border-red-500/40 text-red-200 hover:bg-red-500/15"
            icon={<Trash2 className="h-4 w-4" />}
            label="删除"
            onClick={() => {
              triggerSFX('sfx:structure-delete')
              deleteNode(dimension.id)
              setSelection({ selectedIds: [] })
            }}
          />
        </ActionGroup>
      </PanelSection>
    </PanelWrapper>
  )
}

function selectFoundationControllers(
  nodes: Record<string, AnyNode>,
  excludedId: AnyNodeId,
): ConstructionDimensionNode[] {
  return Object.values(nodes).filter(
    (candidate): candidate is ConstructionDimensionNode =>
      candidate.type === 'construction-dimension' &&
      candidate.id !== excludedId &&
      candidate.drawingType === 'foundation-plan',
  )
}

function FoundationControllerField({
  dimensionId,
  value,
  onChange,
}: {
  dimensionId: AnyNodeId
  value: string
  onChange: (value: NonNullable<ConstructionDimensionNode['controllingDimensionId']>) => void
}) {
  const foundationControllers = useScene(
    useShallow((state) => selectFoundationControllers(state.nodes, dimensionId)),
  )
  return (
    <SelectField
      disabled={foundationControllers.length === 0}
      label="基础控制对象"
      onChange={(controllingDimensionId) =>
        onChange(
          controllingDimensionId as NonNullable<
            ConstructionDimensionNode['controllingDimensionId']
          >,
        )
      }
      options={foundationControllers.map((controller) => ({
        label: controller.name || '基础尺寸标注',
        value: controller.id,
      }))}
      placeholder="暂无基础尺寸"
      value={value}
    />
  )
}

function parseSuppressedSegments(value: string): number[] {
  return [
    ...new Set(
      value
        .split(/[,\s]+/)
        .map((part) => Number.parseInt(part, 10))
        .filter((index) => Number.isInteger(index) && index > 0)
        .map((index) => index - 1),
    ),
  ].sort((left, right) => left - right)
}

function formatSuppressedSegments(indexes: readonly number[]): string {
  return indexes.map((index) => index + 1).join(', ')
}

function SelectField({
  label,
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ label: string; value: string }>
  placeholder?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        className="w-full rounded-md border border-border/70 bg-background px-2 py-1.5 text-foreground disabled:opacity-50"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {placeholder && options.length === 0 ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function TextField({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string
  value: string
  placeholder?: string
  onCommit: (value: string) => void
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        className="w-full rounded-md border border-border/70 bg-background px-2 py-1.5 text-foreground"
        defaultValue={value}
        key={value}
        onBlur={(event) => onCommit(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}
