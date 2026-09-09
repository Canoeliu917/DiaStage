export type BlockTransformAxis = 'x' | 'y' | 'z'
export type BlockTransformPlane = 'xy' | 'xz' | 'yz'
export type BlockTransformOperation = 'translate' | 'rotate' | 'scale'
export type BlockTransformConstraint = BlockTransformAxis | BlockTransformPlane | 'free' | 'uniform'
export type BlockModalFeedbackMode = 'free' | 'grid' | 'angle' | 'exact' | 'geometry'

export type BlockActiveTransform = {
  operation: BlockTransformOperation
  constraint: BlockTransformConstraint
}

export type BlockAxisVisualState = 'normal' | 'active' | 'faded'

export type BlockScreenPoint = { x: number; y: number }

export function blockRotationPointerAngle(
  pivot: BlockScreenPoint,
  start: BlockScreenPoint,
  current: BlockScreenPoint,
): number {
  const startDistanceSquared = (start.x - pivot.x) ** 2 + (start.y - pivot.y) ** 2
  if (startDistanceSquared < 64) {
    return (current.x - start.x - (current.y - start.y)) * 0.01
  }
  return (
    Math.atan2(current.y - pivot.y, current.x - pivot.x) -
    Math.atan2(start.y - pivot.y, start.x - pivot.x)
  )
}

export function blockTransformAxisFromKey(key: string): BlockTransformAxis | null {
  const normalized = key.toLowerCase()
  return normalized === 'x' || normalized === 'y' || normalized === 'z' ? normalized : null
}

export function blockTransformConstraintFromKey(
  key: string,
  planeLock: boolean,
): BlockTransformAxis | BlockTransformPlane | null {
  const axis = blockTransformAxisFromKey(key)
  if (!axis || !planeLock) return axis
  return axis === 'x' ? 'yz' : axis === 'y' ? 'xz' : 'xy'
}

export function blockTransformNumericInputFromKey(current: string, key: string): string | null {
  if (/^\d$/.test(key)) return `${current}${key}`
  if (key === '.') {
    if (current.includes('.')) return current
    if (current === '') return '0.'
    if (current === '-') return '-0.'
    return `${current}.`
  }
  if (key === '-') return current.startsWith('-') ? current.slice(1) : `-${current}`
  if (key === 'Backspace') return current.slice(0, -1)
  return null
}

export function blockTransformNumericValue(
  input: string,
  operation: BlockTransformOperation,
): number | null {
  if (input === '' || input === '-' || input === '.' || input === '-.') return null
  const value = Number(input)
  if (!Number.isFinite(value)) return null
  return operation === 'rotate' ? (value * Math.PI) / 180 : value
}

export function blockTransformDisplayValue(
  operation: BlockTransformOperation,
  value: number,
): string {
  const displayed = operation === 'rotate' ? (value * 180) / Math.PI : value
  return String(Math.round(displayed * 1000) / 1000)
}

export function blockModalFeedbackLabel(mode: BlockModalFeedbackMode): string {
  return mode === 'grid'
    ? '网格吸附'
    : mode === 'angle'
      ? '角度吸附'
      : mode === 'exact'
        ? '精确'
        : mode === 'geometry'
          ? '几何吸附'
          : '自由'
}

export function blockAxisDelta(
  axis: BlockTransformAxis,
  distance: number,
): [number, number, number] {
  return [axis === 'x' ? distance : 0, axis === 'y' ? distance : 0, axis === 'z' ? distance : 0]
}

export function blockPointerDistanceForAxis(_axis: BlockTransformAxis, distance: number): number {
  return distance
}

export function blockConstrainTranslationDelta(
  delta: [number, number, number],
  constraint: BlockTransformConstraint,
): [number, number, number] {
  if (constraint === 'free' || constraint === 'uniform') return delta
  return delta.map((value, index) => {
    const axis = index === 0 ? 'x' : index === 1 ? 'y' : 'z'
    return constraint.includes(axis) ? value : 0
  }) as [number, number, number]
}

export function blockNumericDeltaForConstraint(
  constraint: BlockTransformConstraint,
  pointerDelta: [number, number, number],
  distance: number,
): [number, number, number] {
  if (constraint === 'x' || constraint === 'y' || constraint === 'z') {
    return blockAxisDelta(constraint, distance)
  }
  if (constraint === 'xy' || constraint === 'xz' || constraint === 'yz') {
    const delta: [number, number, number] = [
      constraint.includes('x') ? pointerDelta[0] : 0,
      constraint.includes('y') ? pointerDelta[1] : 0,
      constraint.includes('z') ? pointerDelta[2] : 0,
    ]
    const length = Math.hypot(...delta)
    if (length > 1e-8) return delta.map((value) => (value / length) * distance) as typeof delta
    return blockAxisDelta(constraint[0] as BlockTransformAxis, distance)
  }
  return blockAxisDelta('x', distance)
}

export function blockScaleFactorsForConstraint(
  constraint: BlockTransformConstraint,
  factor: number,
): [number, number, number] {
  if (constraint === 'uniform' || constraint === 'free') return [factor, factor, factor]
  return [
    constraint.includes('x') ? factor : 1,
    constraint.includes('y') ? factor : 1,
    constraint.includes('z') ? factor : 1,
  ]
}

export function blockAxisVisualState(
  activeTransform: BlockActiveTransform | null,
  operation: BlockTransformOperation,
  axis: BlockTransformAxis,
): BlockAxisVisualState {
  if (!activeTransform) return 'normal'
  if (activeTransform.operation !== operation) return 'faded'
  if (activeTransform.constraint === 'free' || activeTransform.constraint === 'uniform') {
    return 'normal'
  }
  if (activeTransform.constraint.length === 2) {
    return activeTransform.constraint.includes(axis) ? 'active' : 'faded'
  }
  return activeTransform.constraint === axis ? 'active' : 'faded'
}

export function blockPlaneVisualState(
  activeTransform: BlockActiveTransform | null,
  plane: BlockTransformPlane,
): BlockAxisVisualState {
  if (!activeTransform) return 'normal'
  if (
    activeTransform.operation !== 'translate' ||
    activeTransform.constraint === 'uniform' ||
    activeTransform.constraint === 'free'
  ) {
    return activeTransform.constraint === 'free' ? 'normal' : 'faded'
  }
  return activeTransform.constraint === plane ? 'active' : 'faded'
}

export function blockModalTransformStatus(
  activeTransform: BlockActiveTransform,
  typedInput = '',
  feedbackMode: BlockModalFeedbackMode = 'free',
): string {
  const operation =
    activeTransform.operation === 'translate'
      ? '移动'
      : activeTransform.operation === 'rotate'
        ? '旋转'
        : '缩放'
  const constraint =
    activeTransform.constraint === 'free'
      ? '自由'
      : activeTransform.constraint === 'uniform'
        ? '等比'
        : activeTransform.constraint.length === 2
          ? `${activeTransform.constraint.toUpperCase()} 平面`
          : `${activeTransform.constraint.toUpperCase()} 轴`
  const typedValue = typedInput
    ? ` · ${typedInput}${
        activeTransform.operation === 'translate'
          ? ' m'
          : activeTransform.operation === 'rotate'
            ? '°'
            : '×'
      }`
    : ''
  return `${operation} · ${constraint}${typedValue} · ${blockModalFeedbackLabel(feedbackMode)} · X/Y/Z 约束 · 单击应用 · Esc 取消`
}
