import type { FloorplanGeometry, GeometryContext, StairNode } from '@pascal-app/core'
import type { FloorplanStairEntry } from '@pascal-app/editor'
import { floorplanGeometryMetadata, readFloorplanContext } from '@pascal-app/editor'
import { formatConstructionLength } from '../shared/construction-length'

export function buildStairDocumentation(
  _stair: StairNode,
  entry: FloorplanStairEntry,
  ctx: GeometryContext,
): FloorplanGeometry[] {
  const context = readFloorplanContext(ctx)
  const format = (value: number) =>
    formatConstructionLength(
      value,
      ctx.viewState?.unit ?? 'metric',
      context.purpose === 'document' ? 'document' : 'editor',
      { metricNotation: context.metricNotation },
    )
  return entry.segments.flatMap(({ segment, polygon }) => {
    const [left, right, front] = polygon
    if (segment.segmentType !== 'stair' || !left || !right || !front) return []
    const width = Math.hypot(right.x - left.x, right.y - left.y)
    if (!width) return []
    const count = Math.max(1, Math.round(segment.stepCount))
    return [
      {
        kind: 'text' as const,
        x: (right.x + front.x) / 2 + ((right.x - left.x) / width) * 0.28,
        y: (right.y + front.y) / 2 + ((right.y - left.y) / width) * 0.28,
        text: `${count} 级 · 步高 ${format(segment.height / count)} · 步深 ${format(segment.length / count)} · 总宽 ${format(segment.width)}`,
        fontSize: 0.125,
        fill: ctx.viewState?.palette.measurementStroke ?? '#333333',
        stroke: '#ffffff',
        strokeWidth: 0.0275,
        paintOrder: 'stroke' as const,
        fontFamily: 'Courier New, Source Han Sans SC, sans-serif',
        fontWeight: 650,
        textAnchor: 'middle' as const,
        dominantBaseline: 'central' as const,
        upright: true,
        metadata: floorplanGeometryMetadata({ annotationRole: 'stair-annotation' }),
      },
    ]
  })
}
