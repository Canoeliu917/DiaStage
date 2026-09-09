import {
  getWallCurveFrameAt,
  getWallCurveLength,
  getWallThickness,
  type QuickMeasurementReport,
  useScene,
  type WallNode,
} from '@pascal-app/core'
import { resolveWallOpeningCeiling } from '../shared/wall-opening-ceiling'

export function wallQuickMeasurement(node: WallNode): QuickMeasurementReport {
  const length = getWallCurveLength(node)
  const height = resolveWallOpeningCeiling(node, useScene.getState().nodes)
  const frame = getWallCurveFrameAt(node, 0.5)

  return {
    title: node.name ?? '墙体',
    kindLabel: '墙体',
    anchor: [frame.point.x, height * 0.55, frame.point.y],
    metrics: [
      { key: 'length', label: '长度', abbreviation: 'L', quantity: 'length', value: length },
      { key: 'height', label: '高度', abbreviation: 'H', quantity: 'length', value: height },
      {
        key: 'surface',
        label: '表面',
        abbreviation: 'A',
        quantity: 'area',
        value: length * height,
      },
      {
        key: 'thickness',
        label: '厚度',
        abbreviation: 'T',
        quantity: 'length',
        value: getWallThickness(node),
      },
    ],
    note: '未扣除门窗洞口的墙面总面积。',
  }
}
