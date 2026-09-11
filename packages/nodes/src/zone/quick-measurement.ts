import type { GeometryContext, QuickMeasurementReport, ZoneNode } from '@pascal-app/core'
import {
  polygonBoundaryLength,
  polygonReportAnchor,
  polygonSurfaceArea,
} from '../shared/quick-measurement'

export function zoneQuickMeasurement(
  node: ZoneNode,
  context?: GeometryContext,
): QuickMeasurementReport | null {
  const polygon = node.polygon
  if (polygon.length < 3) return null

  return {
    title: node.name,
    kindLabel: '区域',
    anchor: polygonReportAnchor(polygon, 0.08),
    metrics: [
      {
        key: 'area',
        label: '平面轮廓',
        abbreviation: 'A',
        quantity: 'area',
        value: polygonSurfaceArea(polygon),
      },
      {
        key: 'perimeter',
        label: '周长',
        abbreviation: 'P',
        quantity: 'length',
        value: polygonBoundaryLength(polygon),
      },
    ],
    note: '仅统计平面轮廓，尚未确认房间围合。',
  }
}
