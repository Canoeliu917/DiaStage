import type { Mode, Phase } from '../store/use-editor'

export const SITE_BOUNDARY_DRAG_LABEL = 'site-boundary'

/**
 * Whether the site's vertex/midpoint handles are grabbable right now.
 *
 * Shared by the 3D boundary editor (`tool-manager.tsx`) and the floorplan's SVG
 * handles (`floorplan-panel.tsx`) because they must agree, and until this existed
 * they did not: each derived the rule from `phase` and `mode` locally.
 */
export function siteBoundaryHandlesEnabled(args: { mode: Mode; phase: Phase }): boolean {
  return args.phase === 'site'
}
