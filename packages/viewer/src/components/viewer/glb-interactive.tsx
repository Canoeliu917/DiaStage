'use client'

import {
  type AnyNodeId,
  type Interactive,
  pointInPolygon,
  type SceneGraph,
  useInteractive,
} from '@pascal-app/core'
import { Html } from '@react-three/drei'
import { createPortal } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { type AnimationAction, LoopRepeat, type Object3D, Vector3 } from 'three'
import { useShallow } from 'zustand/react/shallow'
import useViewer from '../../store/use-viewer'
import { ControlWidget } from '../../systems/interactive/control-widget'

/** An interactive item recovered from the scene graph so the baked GLB can be
 *  re-lit / re-animated by joining on `pascalId`. The GLB carries the geometry
 *  + identity; the effects + controls live in the DB scene graph (no sidecar). */
export type GlbInteractiveItem = {
  pascalId: AnyNodeId
  label: string
  /** Item height (world units) for placing the controls overlay above it. */
  height: number
  interactive: Interactive
}

/** A baked zone's identity node + its local floor polygon (from `extras`). */
export type GlbZoneRef = {
  id: string
  node: Object3D
  polygon: [number, number][]
}

/** Pull the interactive items out of a scene graph. Only items that actually
 *  carry animation effects are returned — everything else is baked
 *  faithfully and needs no runtime help. */
export function buildGlbInteractiveItems(
  sceneGraph: SceneGraph | null | undefined,
): GlbInteractiveItem[] {
  const nodes = sceneGraph?.nodes
  if (!nodes) return []
  const items: GlbInteractiveItem[] = []
  for (const [id, raw] of Object.entries(nodes)) {
    const node = raw as {
      type?: string
      scale?: [number, number, number]
      asset?: { name?: string; dimensions?: [number, number, number]; interactive?: Interactive }
    }
    if (node?.type !== 'item') continue
    const interactive = node.asset?.interactive
    if (!interactive?.effects?.some((effect) => effect.kind === 'animation')) continue
    const dims = node.asset?.dimensions ?? [1, 1, 1]
    const scaleY = node.scale?.[1] ?? 1
    items.push({
      pascalId: id as AnyNodeId,
      label: node.asset?.name ?? id,
      height: (dims[1] ?? 1) * scaleY,
      interactive,
    })
  }
  return items
}

const _itemPos = new Vector3()

/**
 * Re-creates item animation and its controls overlay on top of a baked GLB.
 * Effects come from the DB scene graph (`items`); world transforms come from the
 * baked Object3Ds (`identity`), joined on `pascalId`. Nothing is stamped into
 * the GLB itself, so the artifact stays integrator-clean.
 */
export function GlbInteractive({
  items,
  identity,
  zones,
  actions,
}: {
  items: GlbInteractiveItem[]
  identity: Map<string, Object3D>
  zones: GlbZoneRef[]
  /** Baked animation actions keyed by clip name — ambient item loops play from
   *  `<pascalId>: loop`. */
  actions: Record<string, AnimationAction | null>
}) {
  // Seed control state for every interactive item. The viewer shows a baked
  // scene active: toggles default ON so ambient movement plays on load. Explicit
  // overlay toggles then win. Cleared on unmount so the global store never
  // carries state across scenes.
  useEffect(() => {
    const store = useInteractive.getState()
    for (const item of items) {
      store.initItem(item.pascalId, item.interactive)
      item.interactive.controls.forEach((control, i) => {
        if (control.kind === 'toggle') store.setControlValue(item.pascalId, i, true)
      })
    }
    return () => {
      const store = useInteractive.getState()
      for (const item of items) store.removeItem(item.pascalId)
    }
  }, [items])

  const animationItems = useMemo(
    () => items.filter((item) => item.interactive.effects.some((e) => e.kind === 'animation')),
    [items],
  )

  // Controls overlay is scoped to the focused zone (matches the parametric
  // viewer). Project the zone's baked-local polygon into world space once so an
  // item's world position can be point-tested regardless of level stacking.
  const focusedZoneId = useViewer((s) => s.selection.zoneId)
  const worldPolygon = useMemo<[number, number][] | null>(() => {
    if (!focusedZoneId) return null
    const zone = zones.find((z) => z.id === focusedZoneId)
    if (!zone) return null
    zone.node.updateWorldMatrix(true, false)
    return zone.polygon.map(([x, z]) => {
      const v = new Vector3(x, 0, z).applyMatrix4(zone.node.matrixWorld)
      return [v.x, v.z]
    })
  }, [focusedZoneId, zones])

  return (
    <>
      {animationItems.map((item) => (
        <GlbItemAnimation actions={actions} item={item} key={item.pascalId} />
      ))}
      {items.map((item) => {
        const object = identity.get(item.pascalId)
        return object ? (
          <GlbItemControls
            item={item}
            key={item.pascalId}
            object={object}
            worldPolygon={worldPolygon}
          />
        ) : null
      })}
    </>
  )
}

function GlbItemAnimation({
  item,
  actions,
}: {
  item: GlbInteractiveItem
  actions: Record<string, AnimationAction | null>
}) {
  const values = useInteractive(useShallow((s) => s.items[item.pascalId]?.controlValues))
  const toggleIndex = item.interactive.controls.findIndex((c) => c.kind === 'toggle')
  const isOn = toggleIndex >= 0 ? Boolean(values?.[toggleIndex] ?? true) : true

  useEffect(() => {
    const action = actions[`${item.pascalId}: loop`]
    if (!action) return
    action.loop = LoopRepeat
    action.clampWhenFinished = false
    if (isOn) {
      action.enabled = true
      action.paused = false
      if (!action.isRunning()) action.play()
    } else {
      action.stop()
    }
  }, [actions, item.pascalId, isOn])

  return null
}

const FADE_MS = 300

/** Controls overlay for one item — fades in while the item sits inside the
 *  focused zone, portaled above the baked node. */
function GlbItemControls({
  item,
  object,
  worldPolygon,
}: {
  item: GlbInteractiveItem
  object: Object3D
  worldPolygon: [number, number][] | null
}) {
  const controlValues = useInteractive(useShallow((s) => s.items[item.pascalId]?.controlValues))
  const setControlValue = useInteractive((s) => s.setControlValue)

  let visible = false
  if (worldPolygon?.length) {
    object.getWorldPosition(_itemPos)
    visible = pointInPolygon(_itemPos.x, _itemPos.z, worldPolygon)
  }

  // Fade in on mount and fade out before unmounting the <Html>.
  const [mounted, setMounted] = useState(false)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (visible) {
      setMounted(true)
      let raf2 = 0
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true))
      })
      return () => {
        cancelAnimationFrame(raf1)
        cancelAnimationFrame(raf2)
      }
    }
    setShown(false)
    const timeout = setTimeout(() => setMounted(false), FADE_MS)
    return () => clearTimeout(timeout)
  }, [visible])

  if (!(mounted && controlValues)) return null

  return createPortal(
    <Html
      center
      distanceFactor={8}
      eps={-1}
      position={[0, item.height + 0.3, 0]}
      zIndexRange={[20, 0]}
    >
      {/* Stop pointer/click events from reaching the canvas — otherwise R3F's
          pointer-missed fires and deselects the zone the moment you toggle. */}
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          borderRadius: 8,
          padding: '8px 12px',
          minWidth: 120,
          pointerEvents: visible ? 'auto' : 'none',
          userSelect: 'none',
          opacity: shown ? 1 : 0,
          transition: `opacity ${FADE_MS}ms ease`,
        }}
      >
        {item.interactive.controls.map((control, i) => (
          <ControlWidget
            control={control}
            key={i}
            onChange={(v) => setControlValue(item.pascalId, i, v)}
            value={controlValues[i] ?? false}
          />
        ))}
      </div>
    </Html>,
    object,
  )
}
