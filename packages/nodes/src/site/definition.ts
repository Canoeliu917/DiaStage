import { type NodeDefinition, SiteNode as SiteNodeSchema } from '@pascal-app/core'
import { polygonMeasurementFeatures } from '../shared/polygon-measurement'
import { siteParametrics } from './parametrics'
import { SiteNode } from './schema'

/**
 * Site — Stage A. Top-level container under the scene root; holds
 * buildings + property-line polygon + zones. No system (sites don't
 * have per-frame work). Not movable / deletable — they're the scene
 * root.
 */
export const siteDefinition: NodeDefinition<typeof SiteNode> = {
  kind: 'site',
  schemaVersion: 1,
  schema: SiteNode,
  category: 'site',

  defaults: () => {
    const stub = SiteNodeSchema.parse({ id: 'site_default' as never, type: 'site' })
    const { id: _id, type: _type, ...rest } = stub
    return rest
  },

  capabilities: {
    // Site is the root container — sidebar / property-line tool drive
    // selection, never 3D click (event bubbling from descendants would
    // override their selection). Same reasoning as `level`.
    duplicable: false,
    deletable: false,
  },

  parametrics: siteParametrics,
  measurement: {
    features: (node) =>
      polygonMeasurementFeatures({
        featurePrefix: 'site',
        height: 0,
        label: '用地',
        polygon: node.polygon.points,
      }),
  },
  // No dirty consumer rebuilds this kind — see NodeDefinition.dirtyTracking.
  dirtyTracking: false,

  presentation: {
    label: '场地',
    description: '包含舞台空间、表演区和场地边界的顶层容器。',
    icon: { kind: 'url', src: '/icons/site-flag.webp' },
    paletteSection: 'site',
    paletteOrder: 5,
  },

  mcp: {
    description: 'Top-level theatre venue container.',
  },
}
