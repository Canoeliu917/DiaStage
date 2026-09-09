'use client'

import {
  type AnyNode,
  type AnyNodeId,
  BoxVentNode as BoxVentSchema,
  getActiveRoofHeight,
  type RoofSegmentNode,
  useLiveNodeOverrides,
  useScene,
} from '@pascal-app/core'
import {
  ActionButton,
  ActionGroup,
  PanelSection,
  PanelWrapper,
  SegmentedControl,
  SliderControl,
  triggerSFX,
  useEditor,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { Copy, Move, Trash2 } from 'lucide-react'
import { useCallback } from 'react'
import type { BoxVentNode } from './schema'

/**
 * Inspector panel for a placed box-vent. Exposes the same parametrics
 * as the auto-derived inspector (style + dimensions) plus Move /
 * Duplicate / Delete actions wired into the same ghost-preview drag
 * flow the placement tool uses.
 *
 * Move sets the vent as `editor.movingNode` — the registered move
 * affordance tool (see `./move-tool.tsx`) takes over from there.
 * Duplicate inserts a fresh clone into the scene (marked `isNew` so a
 * cancelled drag deletes it), then routes the same way. On click the
 * ghost commits; on Esc it cancels and the original mesh is restored.
 */
export default function BoxVentPanel() {
  const selectedId = useViewer((s) => s.selection.selectedIds[0])
  const setSelection = useViewer((s) => s.setSelection)
  const updateNode = useScene((s) => s.updateNode)
  const deleteNode = useScene((s) => s.deleteNode)
  const setMovingNode = useEditor((s) => s.setMovingNode)

  const storeNode = useScene((s) =>
    selectedId ? (s.nodes[selectedId as AnyNode['id']] as BoxVentNode | undefined) : undefined,
  )
  // Mirror any in-progress slider drag so the panel reads the same live
  // values the renderer paints. Without this the slider thumb would jump
  // back to the store value on every render until commit.
  const overrides = useLiveNodeOverrides((s) =>
    selectedId ? (s.get(selectedId as AnyNodeId) as Partial<BoxVentNode> | undefined) : undefined,
  )
  const node: BoxVentNode | undefined =
    storeNode && overrides ? ({ ...storeNode, ...overrides } as BoxVentNode) : storeNode

  // Pull the parent segment so the Position sliders can clamp to the
  // segment's footprint (no point letting the user drag the vent off
  // the eaves into thin air).
  const segment = useScene((s) =>
    node?.roofSegmentId
      ? (s.nodes[node.roofSegmentId as AnyNodeId] as RoofSegmentNode | undefined)
      : undefined,
  )

  // Slider drag (during): write to the ephemeral live-overrides store so
  // the mesh updates frame-by-frame without thrashing the scene store
  // (or polluting undo history).
  const previewProp = useCallback(
    (updates: Partial<BoxVentNode>) => {
      if (!selectedId) return
      useLiveNodeOverrides.getState().set(selectedId as AnyNodeId, updates)
    },
    [selectedId],
  )

  // Slider release (commit): flush to the scene store as a single
  // undoable change and clear the live override.
  const commitProp = useCallback(
    (updates: Partial<BoxVentNode>) => {
      if (!selectedId) return
      updateNode(selectedId as AnyNode['id'], updates)
      useLiveNodeOverrides.getState().clear(selectedId as AnyNodeId)
    },
    [selectedId, updateNode],
  )

  // Discrete / one-shot updates (style switch, end-cap toggle) bypass
  // the live-override dance — they're never part of a drag.
  const handleUpdate = commitProp

  const handleClose = useCallback(() => {
    setSelection({ selectedIds: [] })
  }, [setSelection])

  const handleBack = useCallback(() => {
    if (node?.roofSegmentId) {
      setSelection({ selectedIds: [node.roofSegmentId as AnyNode['id']] })
    }
  }, [node?.roofSegmentId, setSelection])

  const handleMove = useCallback(() => {
    if (!node) return
    triggerSFX('sfx:item-pick')
    // `setMovingNode`'s type union doesn't include roof-mounted kinds —
    // skylight / chimney / etc. take the same `as never` escape hatch.
    setMovingNode(node as never)
    setSelection({ selectedIds: [] })
  }, [node, setMovingNode, setSelection])

  const handleDuplicate = useCallback(() => {
    if (!node) return
    triggerSFX('sfx:item-pick')
    const parentId = node.roofSegmentId as AnyNodeId | undefined
    if (!parentId) return

    // Clone via the schema parser so the new node gets a fresh ID and
    // valid defaults. Keep position/rotation/dimensions identical to the
    // source — the user will drag it to its real destination next.
    const state = useScene.getState()
    const meta =
      typeof node.metadata === 'object' && node.metadata !== null
        ? (node.metadata as Record<string, unknown>)
        : {}
    const cloneInput = {
      ...node,
      id: undefined,
      metadata: { ...meta, isNew: true },
    } as Record<string, unknown>
    // Use the schema parser so the new node gets a fresh ID and stays
    // in sync with the placement-tool defaults.
    const cloned = BoxVentSchema.parse(cloneInput) as BoxVentNode

    state.createNode(cloned, parentId)
    state.dirtyNodes.add(parentId)
    setMovingNode(cloned as never)
    setSelection({ selectedIds: [] })
  }, [node, setMovingNode, setSelection])

  const handleDelete = useCallback(() => {
    if (!(selectedId && node)) return
    triggerSFX('sfx:item-delete')
    const segmentId = node.roofSegmentId
    if (segmentId) {
      const state = useScene.getState()
      const segment = state.nodes[segmentId as AnyNodeId] as RoofSegmentNode | undefined
      if (segment) {
        state.updateNode(segmentId as AnyNode['id'], {
          children: (segment.children ?? []).filter((id) => id !== selectedId),
        })
      }
    }
    deleteNode(selectedId as AnyNodeId)
    if (segmentId) {
      useScene.getState().dirtyNodes.add(segmentId as AnyNodeId)
      setSelection({ selectedIds: [segmentId as AnyNode['id']] })
    } else {
      setSelection({ selectedIds: [] })
    }
  }, [selectedId, node, deleteNode, setSelection])

  if (!(node && node.type === 'box-vent' && selectedId)) return null

  return (
    <PanelWrapper
      icon="/icons/roof.webp"
      onBack={node.roofSegmentId ? handleBack : undefined}
      onClose={handleClose}
      title={node.name || '箱式通风口'}
      width={300}
    >
      <PanelSection title="样式">
        <SegmentedControl
          onChange={(v) => handleUpdate({ style: v as BoxVentNode['style'] })}
          options={[
            { label: '箱式', value: 'box' },
            { label: '罩帽', value: 'cap' },
            { label: '穹顶', value: 'dome' },
          ]}
          value={node.style ?? 'cap'}
        />
      </PanelSection>

      <PanelSection title="尺寸">
        <SliderControl
          label="宽度"
          max={1000}
          min={0.15}
          onChange={(v) => previewProp({ width: v })}
          onCommit={(v) => handleUpdate({ width: v })}
          precision={2}
          restoreOnCommit={false}
          step={0.01}
          unit="m"
          value={Math.round(node.width * 100) / 100}
        />
        <SliderControl
          label="深度"
          max={1000}
          min={0.15}
          onChange={(v) => previewProp({ depth: v })}
          onCommit={(v) => handleUpdate({ depth: v })}
          precision={2}
          restoreOnCommit={false}
          step={0.01}
          unit="m"
          value={Math.round(node.depth * 100) / 100}
        />
        <SliderControl
          label="高度"
          max={1000}
          min={0.05}
          onChange={(v) => previewProp({ height: v })}
          onCommit={(v) => handleUpdate({ height: v })}
          precision={2}
          restoreOnCommit={false}
          step={0.01}
          unit="m"
          value={Math.round(node.height * 100) / 100}
        />
        {/* Hood Overhang is `cap`-only — the dome shape rolls down to
            the body footprint without a flange skirt, and `box` doesn't
            have a hood at all. Max scales with width so wider vents can
            flare further past the body. */}
        {node.style === 'cap' && (
          <SliderControl
            label="罩帽挑出"
            max={Math.max(0.02, node.width)}
            min={0}
            onChange={(v) => previewProp({ hoodOverhang: v })}
            onCommit={(v) => handleUpdate({ hoodOverhang: v })}
            precision={3}
            restoreOnCommit={false}
            step={0.005}
            unit="m"
            value={Math.round((node.hoodOverhang ?? 0) * 1000) / 1000}
          />
        )}
        {node.style === 'box' && (
          <>
            <SliderControl
              label="底座内缩"
              max={Math.max(0.005, Math.min(node.width, node.depth) / 2 - 0.005)}
              min={0}
              onChange={(v) => previewProp({ baseInset: v })}
              onCommit={(v) => handleUpdate({ baseInset: v })}
              precision={3}
              restoreOnCommit={false}
              step={0.005}
              unit="m"
              value={Math.round((node.baseInset ?? 0.06) * 1000) / 1000}
            />
            <SliderControl
              label="底座高度"
              max={Math.max(0.01, node.height - 0.005)}
              min={0.005}
              onChange={(v) => previewProp({ baseHeight: v })}
              onCommit={(v) => handleUpdate({ baseHeight: v })}
              precision={3}
              restoreOnCommit={false}
              step={0.005}
              unit="m"
              value={Math.round((node.baseHeight ?? 0.04) * 1000) / 1000}
            />
            <SliderControl
              label="转角倒角"
              max={Math.max(
                0,
                Math.min(node.width, node.depth) / 2 - (node.baseInset ?? 0.06) - 0.001,
              )}
              min={0}
              onChange={(v) => previewProp({ cornerBevel: v })}
              onCommit={(v) => handleUpdate({ cornerBevel: v })}
              precision={3}
              restoreOnCommit={false}
              step={0.002}
              unit="m"
              value={Math.round((node.cornerBevel ?? 0.012) * 1000) / 1000}
            />
          </>
        )}
        {node.style === 'cap' && (
          <>
            <SliderControl
              label="罩帽高度"
              max={Math.max(0.02, node.height - 0.01)}
              min={0.01}
              onChange={(v) => previewProp({ capHeight: v })}
              onCommit={(v) => handleUpdate({ capHeight: v })}
              precision={3}
              restoreOnCommit={false}
              step={0.005}
              unit="m"
              value={Math.round((node.capHeight ?? 0.07) * 1000) / 1000}
            />
            <SliderControl
              label="间隙高度"
              max={Math.max(0, node.height - Math.max(0.01, node.capHeight ?? 0.07) - 0.005)}
              min={0}
              onChange={(v) => previewProp({ capGap: v })}
              onCommit={(v) => handleUpdate({ capGap: v })}
              precision={3}
              restoreOnCommit={false}
              step={0.005}
              unit="m"
              value={Math.round((node.capGap ?? 0) * 1000) / 1000}
            />
            <SliderControl
              label="顶部收分"
              max={1}
              min={0}
              onChange={(v) => previewProp({ topTaper: v })}
              onCommit={(v) => handleUpdate({ topTaper: v })}
              precision={2}
              restoreOnCommit={false}
              step={0.05}
              unit=""
              value={Math.round((node.topTaper ?? 0.4) * 100) / 100}
            />
          </>
        )}
        {node.style === 'dome' && (
          <>
            <SliderControl
              label="穹顶曲率"
              max={1.5}
              min={0.3}
              onChange={(v) => previewProp({ domeCurvature: v })}
              onCommit={(v) => handleUpdate({ domeCurvature: v })}
              precision={2}
              restoreOnCommit={false}
              step={0.05}
              unit=""
              value={Math.round((node.domeCurvature ?? 1.0) * 100) / 100}
            />
            <SliderControl
              label="底座法兰"
              max={0.2}
              min={0}
              onChange={(v) => previewProp({ hoodOverhang: v })}
              onCommit={(v) => handleUpdate({ hoodOverhang: v })}
              precision={3}
              restoreOnCommit={false}
              step={0.005}
              unit="m"
              value={Math.round((node.hoodOverhang ?? 0.04) * 1000) / 1000}
            />
          </>
        )}
      </PanelSection>

      <PanelSection title="位置">
        <SliderControl
          label="X"
          max={Math.round(((segment?.width ?? 10) / 2) * 100) / 100}
          min={-Math.round(((segment?.width ?? 10) / 2) * 100) / 100}
          onChange={(v) =>
            previewProp({
              position: [v, node.position[1] ?? 0, node.position[2] ?? 0],
            })
          }
          onCommit={(v) =>
            handleUpdate({
              position: [v, node.position[1] ?? 0, node.position[2] ?? 0],
            })
          }
          precision={2}
          restoreOnCommit={false}
          step={0.05}
          unit="m"
          value={Math.round((node.position[0] ?? 0) * 100) / 100}
        />
        <SliderControl
          label="Y"
          max={Math.max(
            (segment?.wallHeight ?? 3) + (segment ? getActiveRoofHeight(segment) : 3) + 2,
            (node.position[1] ?? 0) + 0.1,
          )}
          min={Math.min(0, (node.position[1] ?? 0) - 0.5)}
          onChange={(v) =>
            previewProp({
              position: [node.position[0] ?? 0, v, node.position[2] ?? 0],
            })
          }
          onCommit={(v) =>
            handleUpdate({
              position: [node.position[0] ?? 0, v, node.position[2] ?? 0],
            })
          }
          precision={2}
          restoreOnCommit={false}
          step={0.05}
          unit="m"
          value={Math.round((node.position[1] ?? 0) * 100) / 100}
        />
        <SliderControl
          label="Z"
          max={Math.round(((segment?.depth ?? 10) / 2) * 100) / 100}
          min={-Math.round(((segment?.depth ?? 10) / 2) * 100) / 100}
          onChange={(v) =>
            previewProp({
              position: [node.position[0] ?? 0, node.position[1] ?? 0, v],
            })
          }
          onCommit={(v) =>
            handleUpdate({
              position: [node.position[0] ?? 0, node.position[1] ?? 0, v],
            })
          }
          precision={2}
          restoreOnCommit={false}
          step={0.05}
          unit="m"
          value={Math.round((node.position[2] ?? 0) * 100) / 100}
        />
        <SliderControl
          label="旋转"
          max={180}
          min={-180}
          onChange={(deg) => previewProp({ rotation: (deg * Math.PI) / 180 })}
          onCommit={(deg) => handleUpdate({ rotation: (deg * Math.PI) / 180 })}
          precision={0}
          restoreOnCommit={false}
          step={1}
          unit="°"
          value={Math.round(((node.rotation ?? 0) * 180) / Math.PI)}
        />
      </PanelSection>

      <PanelSection title="操作">
        <ActionGroup>
          <ActionButton icon={<Move className="h-3.5 w-3.5" />} label="移动" onClick={handleMove} />
          <ActionButton
            icon={<Copy className="h-3.5 w-3.5" />}
            label="复制"
            onClick={handleDuplicate}
          />
          <ActionButton
            className="hover:bg-red-500/20"
            icon={<Trash2 className="h-3.5 w-3.5 text-red-400" />}
            label="删除"
            onClick={handleDelete}
          />
        </ActionGroup>
      </PanelSection>
    </PanelWrapper>
  )
}
