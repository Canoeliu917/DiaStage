export const DIA_TABLET_QUERY =
  '(min-width: 600px) and (max-width: 1399px) and (any-pointer: coarse)'
export const DIA_EDGE_SIZE = 48
export type UiRect = { left: number; top: number; width: number; height: number }

export function clampDiaTabY(preferred: number, viewport: UiRect, exclusions: UiRect[]) {
  const x = viewport.left + viewport.width - DIA_EDGE_SIZE
  const min = viewport.top
  const max = viewport.top + viewport.height - DIA_EDGE_SIZE
  if (max < min) return null
  const blocked = exclusions.filter(
    (rect) =>
      rect.width > 0 &&
      rect.height > 0 &&
      x < rect.left + rect.width + 10 &&
      x + DIA_EDGE_SIZE > rect.left - 10,
  )
  const legal = (y: number) =>
    y >= min &&
    y <= max &&
    blocked.every((rect) => y + DIA_EDGE_SIZE <= rect.top - 10 || y >= rect.top + rect.height + 10)
  const desired = Math.max(min, Math.min(max, preferred))
  const candidates = [
    desired,
    min,
    max,
    ...blocked.flatMap((rect) => [rect.top - DIA_EDGE_SIZE - 10, rect.top + rect.height + 10]),
  ].filter(legal)
  return (
    candidates.sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b)[0] ?? null
  )
}
