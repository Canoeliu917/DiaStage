export type TransformAxis = 0 | 1 | 2
export type TransformVector = [number, number, number]

export function axisTransform(
  initial: TransformVector,
  axis: TransformAxis,
  delta: number,
  step = 0,
): TransformVector {
  const next: TransformVector = [...initial]
  const value = initial[axis] + delta
  next[axis] = step ? Math.round(value / step) * step : value
  return next
}
