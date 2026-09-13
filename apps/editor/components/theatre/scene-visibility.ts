'use client'

import { useLiveNodeOverrides, useScene } from '@pascal-app/core'
import { useEffect, useMemo } from 'react'
import { theatreNodeLayer } from '@/lib/theatre/venue-model'
import { getStageNodeSelection } from '../stage-overview-data'
import { useSimulationSelection } from './simulation-panel'

export function rehearsalSceneSelection(sceneId: string, nodes = useScene.getState().nodes) {
  const object =
    Object.values(nodes).find((node) => node.metadata.rehearsalSceneId === sceneId) ??
    Object.values(nodes).find((node) => node.type === 'level')
  return object ? { ...getStageNodeSelection(nodes, object.id), selectedIds: [] } : null
}

/** Keep non-active rehearsal scenery out of both viewers without changing saved visibility. */
export function createTheatreSceneVisibility() {
  const owned = new Set<string>()
  const clear = (id: string) => {
    if (useLiveNodeOverrides.getState().get(id)?.theatreSceneVisibility === true)
      useLiveNodeOverrides.getState().clearFields(id, ['theatreSceneVisibility', 'visible'])
    owned.delete(id)
  }
  return {
    apply(activeSceneId: string | null, hiddenNodeIds: string[] = []) {
      const hidden = new Set(hiddenNodeIds)
      if (activeSceneId) {
        for (const node of Object.values(useScene.getState().nodes)) {
          if (
            typeof node.metadata.rehearsalSceneId === 'string' &&
            node.metadata.rehearsalSceneId !== activeSceneId &&
            node.visible !== false
          )
            hidden.add(node.id)
        }
      }
      for (const id of owned) if (!hidden.has(id)) clear(id)
      const entries: Array<readonly [string, Record<string, unknown>]> = []
      for (const id of hidden) {
        const current = useLiveNodeOverrides.getState().get(id)
        if (current?.visible !== undefined && current.theatreSceneVisibility !== true) continue
        owned.add(id)
        if (current?.theatreSceneVisibility !== true)
          entries.push([id, { theatreSceneVisibility: true, visible: false }])
      }
      useLiveNodeOverrides.getState().setMany(entries)
    },
    restore() {
      for (const id of [...owned]) clear(id)
    },
  }
}

/** The existing override owner feeds both 2D and 3D; saved visibility stays untouched. */
export function SceneLayersRuntime({ enabled }: { enabled: boolean }) {
  const nodes = useScene((state) => state.nodes)
  const showVenue = useSimulationSelection((state) => state.showVenue)
  const showScenery = useSimulationSelection((state) => state.showScenery)
  const display = useMemo(() => createTheatreSceneVisibility(), [])
  useEffect(() => {
    useSimulationSelection.setState({
      showVenue: true,
      showScenery: true,
      showPerformers: true,
      showGhost: true,
    })
    return () => display.restore()
  }, [display])
  useEffect(() => {
    display.apply(
      null,
      enabled
        ? Object.values(nodes)
            .filter((node) => {
              const layer = theatreNodeLayer(node)
              return (
                node.visible !== false &&
                ((layer === 'venue' && !showVenue) || (layer === 'scenery' && !showScenery))
              )
            })
            .map((node) => node.id)
        : [],
    )
  }, [nodes, showVenue, showScenery, enabled, display])
  return null
}
