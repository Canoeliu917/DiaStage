import type { QuickMeasurementReport, SlabNode } from '@pascal-app/core'
import {
  polygonBoundaryLength,
  polygonReportAnchor,
  polygonSurfaceArea,
} from '../shared/quick-measurement'

export function slabQuickMeasurement(node: SlabNode): QuickMeasurementReport | null {
  if (node.polygon.length < 3) return null
  const elevation = node.elevation ?? 0.05
  const thickness = node.thickness ?? 0.05

  return {
    title: node.name ?? '舞台平台',
    kindLabel: '舞台平台',
    anchor: polygonReportAnchor(node.polygon, elevation + 0.04),
    metrics: [
      {
        key: 'area',
        label: '表面',
        abbreviation: 'A',
        quantity: 'area',
        value: polygonSurfaceArea(node.polygon, node.holes),
      },
      {
        key: 'perimeter',
        label: '周长',
        abbreviation: 'P',
        quantity: 'length',
        value: polygonBoundaryLength(node.polygon),
      },
      {
        key: 'thickness',
        label: '厚度',
        abbreviation: 'T',
        quantity: 'length',
        value: thickness,
      },
    ],
    note: node.holes.length > 0 ? '表面积已扣除舞台平台孔洞。' : undefined,
  }
}
