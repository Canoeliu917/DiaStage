import type { BlockCommand } from './commands'
import { type BlockModalFeedbackMode, blockModalFeedbackLabel } from './modal-transform'

export type BlockModalFaceOperation = 'extrude' | 'inset'
export type BlockExtrudeAxis = 'normal' | 'x' | 'y' | 'z'

type BlockPointerClientPosition = {
  x: number
  y: number
}

export function blockFaceOperationValueFromPointer(
  operation: BlockModalFaceOperation,
  startPointer: BlockPointerClientPosition,
  currentPointer: BlockPointerClientPosition,
  pivot: BlockPointerClientPosition,
  topologyExtent: number,
  projectedExtentPixels: number,
  extrusionDirection?: BlockPointerClientPosition | null,
): number {
  const safeProjectedExtent = Math.max(1, Math.abs(projectedExtentPixels))
  if (operation === 'extrude') {
    const directionLength = extrusionDirection
      ? Math.hypot(extrusionDirection.x, extrusionDirection.y)
      : 0
    if (extrusionDirection && directionLength > 1e-6) {
      const pointerTravel =
        ((currentPointer.x - startPointer.x) * extrusionDirection.x +
          (currentPointer.y - startPointer.y) * extrusionDirection.y) /
        directionLength
      return (pointerTravel / safeProjectedExtent) * topologyExtent
    }
    return (
      ((currentPointer.x - startPointer.x - (currentPointer.y - startPointer.y)) /
        safeProjectedExtent) *
      topologyExtent
    )
  }
  const startDistance = Math.hypot(startPointer.x - pivot.x, startPointer.y - pivot.y)
  const currentDistance = Math.hypot(currentPointer.x - pivot.x, currentPointer.y - pivot.y)
  const inwardTravel = startDistance - currentDistance
  return Math.min(0.95, Math.max(0, inwardTravel / safeProjectedExtent))
}

export function blockFaceOperationCommand(
  operation: BlockModalFaceOperation,
  faceIds: string[],
  value: number,
  extrudeAxis: BlockExtrudeAxis = 'normal',
): BlockCommand {
  return operation === 'extrude'
    ? {
        type: 'extrude-faces',
        faceIds,
        distance: value,
        ...(extrudeAxis === 'normal' ? {} : { axis: extrudeAxis }),
      }
    : { type: 'inset-faces', faceIds, amount: value, depth: 0 }
}

export function blockModalFaceOperationStatus(
  operation: BlockModalFaceOperation,
  value: string,
  feedbackMode: BlockModalFeedbackMode = 'free',
  extrudeAxis: BlockExtrudeAxis = 'normal',
): string {
  const label = operation === 'extrude' ? '挤出' : '内插'
  const unit = operation === 'extrude' ? 'm' : '比例'
  const axis =
    operation === 'extrude' && extrudeAxis !== 'normal' ? ` · ${extrudeAxis.toUpperCase()} 轴` : ''
  return `${label} · ${value} ${unit} · ${blockModalFeedbackLabel(feedbackMode)}${axis} · 输入数值 · 单击应用 · Esc 取消`
}
