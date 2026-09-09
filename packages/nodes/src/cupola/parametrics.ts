import type { ParametricDescriptor } from '@pascal-app/core'
import type { CupolaNode } from './schema'

/**
 * Inspector descriptor for the cupola. Move / Duplicate use the kind-owned
 * ghost-preview flow (see `./move-tool.tsx`), so the panel hosts those
 * actions itself — same pattern as box-vent.
 */
export const cupolaParametrics: ParametricDescriptor<CupolaNode> = {
  customPanel: () => import('./panel'),
  groups: [
    {
      label: '样式',
      fields: [
        {
          key: 'roofStyle',
          kind: 'enum',
          options: ['dome', 'pyramid'],
          display: 'segmented',
        },
        { key: 'finial', kind: 'boolean' },
      ],
    },
    {
      label: '尺寸',
      fields: [
        { key: 'width', kind: 'number', unit: 'm', min: 0.3, max: 1000, step: 0.05 },
        { key: 'depth', kind: 'number', unit: 'm', min: 0.3, max: 1000, step: 0.05 },
        { key: 'height', kind: 'number', unit: 'm', min: 0.4, max: 1000, step: 0.05 },
      ],
    },
  ],
}
