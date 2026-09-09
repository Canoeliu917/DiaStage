import type { RoofType } from '@pascal-app/core'

export type RoofFeatureIdentity = {
  id: string
  kind?: string
}

export const ROOF_TYPE_OPTIONS: ReadonlyArray<{ label: string; value: RoofType }> = [
  { label: '四坡顶', value: 'hip' },
  { label: '双坡顶', value: 'gable' },
  { label: '单坡顶', value: 'shed' },
  { label: '平屋顶', value: 'flat' },
  { label: '折线双坡顶', value: 'gambrel' },
  { label: '半歇山顶', value: 'dutch' },
  { label: '折线四坡顶', value: 'mansard' },
  { label: '圆锥顶', value: 'conical' },
]

export function getActiveRoofFeatureId(
  features: readonly RoofFeatureIdentity[],
  activeTool: string | null | undefined,
): string | null {
  if (!activeTool) return null
  return features.find((feature) => feature.kind === activeTool)?.id ?? null
}
