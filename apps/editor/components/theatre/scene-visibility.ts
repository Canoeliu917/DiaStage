import { useLiveNodeOverrides, useScene } from '@pascal-app/core'
import { getStageNodeSelection } from '../stage-overview-data'

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
    apply(activeSceneId: string | null) {
      const hidden = new Set<string>()
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
