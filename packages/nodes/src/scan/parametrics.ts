import type { ParametricDescriptor, ScanNode } from '@pascal-app/core'

export const scanParametrics: ParametricDescriptor<ScanNode> = {
  customPanel: () => import('./panel'),
  groups: [
    {
      label: '变换',
      fields: [
        { key: 'position', kind: 'vec3' },
        { key: 'scale', kind: 'number', min: 0.01, max: 1000, step: 0.1 },
      ],
    },
    {
      label: '外观',
      fields: [{ key: 'opacity', kind: 'number', unit: '%', min: 0, max: 100, step: 1 }],
    },
  ],
}
