'use client'

import {
  type AnyNodeId,
  RAISE_METRES_PER_STROKE,
  type SiteNode,
  type TerrainVerb,
  useScene,
} from '@pascal-app/core'
import { Mountain, Pipette } from 'lucide-react'
import { brushRadiusRange, flattenSite, resetSiteTerrain } from '../../../lib/terrain-sculpt'
import useEditor from '../../../store/use-editor'
import { Button } from '../primitives/button'
import { SegmentedControl } from './segmented-control'
import { SliderControl } from './slider-control'

const VERB_OPTIONS: Array<{ value: TerrainVerb; iconSrc: string; hint: string }> = [
  { value: 'raise', iconSrc: '/icons/terrain-raise.webp', hint: '抬高' },
  { value: 'lower', iconSrc: '/icons/terrain-lower.webp', hint: '降低' },
  { value: 'flatten', iconSrc: '/icons/terrain-flatten.webp', hint: '平整' },
  { value: 'smooth', iconSrc: '/icons/terrain-smooth.webp', hint: '平滑' },
]

const VERB_HINTS: Record<TerrainVerb, string> = {
  raise: `拖动以抬高地面。每次最多抬高 ${RAISE_METRES_PER_STROKE} m，松开后再次拖动可继续。`,
  lower: `拖动以降低地面，每次最多降低 ${RAISE_METRES_PER_STROKE} m。`,
  flatten: '拖动以将地面平整至目标高度，不会超出目标。',
  smooth: '拖动以柔化斜坡并消除凸棱，平地保持不变。',
}

/**
 * Sculpt controls for terrain mode — verb, brush, and the two lot-wide actions.
 *
 * A panel rather than a floating HUD because the brush settings are the sort of
 * thing a user adjusts between strokes and then leaves alone, and because
 * sculpting already owns the whole viewport pointer: putting controls over the
 * canvas would put them over the surface being sculpted.
 *
 * Embedders mount this wherever their sculpt controls belong (the community
 * editor puts it in the Build sidebar while sculpt mode is active), exactly like
 * `MaterialPaintPanel`.
 */
export function TerrainSculptPanel() {
  const verb = useEditor((state) => state.terrainVerb)
  const setTerrainVerb = useEditor((state) => state.setTerrainVerb)
  const brush = useEditor((state) => state.terrainBrush)
  const setTerrainBrush = useEditor((state) => state.setTerrainBrush)
  const flattenTarget = useEditor((state) => state.terrainFlattenTarget)
  const setTerrainFlattenTarget = useEditor((state) => state.setTerrainFlattenTarget)
  const sampling = useEditor((state) => state.terrainSampling)
  const setTerrainSampling = useEditor((state) => state.setTerrainSampling)

  const nodes = useScene((state) => state.nodes)
  const rootNodeIds = useScene((state) => state.rootNodeIds)
  const siteId = rootNodeIds[0]
  const siteNode = siteId ? nodes[siteId as AnyNodeId] : undefined
  const site = siteNode?.type === 'site' ? (siteNode as SiteNode) : null
  const [minRadius, maxRadius] = brushRadiusRange(site)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <SegmentedControl
          className="h-14"
          onChange={(next) => setTerrainVerb(next)}
          options={VERB_OPTIONS.map(({ value, iconSrc, hint }) => ({
            value,
            label: (
              <span className="flex flex-col items-center gap-0.5">
                <img
                  alt=""
                  aria-hidden
                  className="size-7 object-contain"
                  draggable={false}
                  height={28}
                  src={iconSrc}
                  width={28}
                />
                <span className="text-[9px] leading-none">{hint}</span>
              </span>
            ),
          }))}
          value={verb}
        />
        <p className="px-0.5 text-muted-foreground text-xs">{VERB_HINTS[verb]}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        {/*
          Range from `brushRadiusRange`, shared with the `[`/`]` keys. The low end
          is not a preference: it tracks the field's sample spacing, and a brush
          under it lands between samples and paints nothing at all.
        */}
        <SliderControl
          label="大小"
          max={maxRadius}
          min={minRadius}
          onChange={(radius) => setTerrainBrush({ radius })}
          precision={1}
          step={0.5}
          unit="m"
          value={brush.radius}
        />
        <SliderControl
          label="强度"
          max={1}
          min={0.05}
          onChange={(strength) => setTerrainBrush({ strength })}
          precision={2}
          step={0.05}
          value={brush.strength}
        />
        <SliderControl
          label="柔和度"
          max={1}
          min={0}
          onChange={(falloff) => setTerrainBrush({ falloff })}
          precision={2}
          step={0.05}
          value={brush.falloff}
        />
        <SegmentedControl
          onChange={(shape) => setTerrainBrush({ shape })}
          options={[
            { value: 'round', label: '圆形' },
            { value: 'square', label: '方形' },
          ]}
          value={brush.shape}
        />
      </div>

      {verb === 'flatten' && (
        <div className="flex flex-col gap-1.5 border-border/60 border-t pt-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <SliderControl
                label="目标"
                max={50}
                min={-50}
                onChange={setTerrainFlattenTarget}
                precision={2}
                step={0.1}
                unit="m"
                value={flattenTarget ?? 0}
              />
            </div>
            <Button
              aria-label="从地面拾取目标高度"
              aria-pressed={sampling}
              onClick={() => setTerrainSampling(!sampling)}
              size="icon-sm"
              type="button"
              variant={sampling ? 'default' : 'outline'}
            >
              <Pipette />
            </Button>
          </div>
          <p className="px-0.5 text-muted-foreground text-xs">
            {sampling
              ? '点击地面，将其高度设为目标。'
              : flattenTarget === null
                ? '尚未设置目标，首次点击会采样该处地面高度。'
                : '每次平整笔划都会趋近此高度。'}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 border-border/60 border-t pt-3">
        <Button
          className="flex-1"
          disabled={!site}
          onClick={() => site && flattenSite(site, flattenTarget ?? 0)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Mountain />
          平整地块
        </Button>
        <Button
          className="flex-1"
          disabled={!site?.terrain}
          onClick={() => site && resetSiteTerrain(site)}
          size="sm"
          type="button"
          variant="outline"
        >
          清除地形
        </Button>
      </div>
    </div>
  )
}
