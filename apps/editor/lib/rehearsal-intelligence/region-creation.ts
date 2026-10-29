import {
  parseStageNumber,
  prepareStageCollision,
  resolveStageObjectSpecs,
  type SceneContextSummary,
  type StageItemProposal,
  type StagePlan,
  validateStagePlan,
} from '@pascal-app/core/stage'
import { AVAILABLE_STAGE_SCENERY, stagePropCollisionGeometry } from '../stage/prop-assets'
import { createUUID } from '../uuid'

const creationVerb = '(?:生成|添加|新增|创建|摆放|放置|摆|放)'
const countPattern = '[一二两三四五六七八九十\\d]+'
type Wall = 'back' | 'front' | 'left' | 'right'

/** New assets plus a stage region are one proposal, not a move of the current selection. */
export function createRegionPlan(input: string, context: SceneContextSummary): StagePlan | null {
  const text = input
    .normalize('NFKC')
    .replace(/\s/g, '')
    .replace(/[。！!]$/, '')
    .replace(/^(?:(?:请|麻烦|帮我|给我))*/, '')
  const prefix = text.match(new RegExp(`^(?:在|往)(.+?)${creationVerb}(.+)$`))
  const suffix = text.match(new RegExp(`^${creationVerb}(.+?)(?:到|在)(.+)$`))
  if (!prefix && !suffix) return null
  const location = (prefix?.[1] ?? suffix![2]!).replace(/(?:的)?(?:位置|地方)$/, '')
  const noun = prefix?.[2] ?? suffix![1]!
  const region = location.match(
    /^(观众(?:视角)?|演员(?:视角)?|舞台|台)?(左前|右前|中前|左后|右后|中后|左中|右中|左|右|前|后|中|中央|中间|正中)(?:侧|边)?(?:区|方)?(?:(?:靠|贴)(?:着)?(后墙|前墙|左墙|右墙|墙边|墙))?$/,
  )
  if (!region || /不要|不能|别|或者|还是|然后|同时|[，,；;？?]/.test(text)) return null
  const plan: StagePlan = {
    schemaVersion: 1,
    source: 'typed-command',
    venue: null,
    items: [],
    relations: [],
    assumptions: [],
    questions: [],
    evidence: [],
    warnings: [],
  }
  const ask = (message: string) => {
    plan.items = []
    plan.questions.push({ id: 'region-creation', message, options: [] })
    return plan
  }
  const assume = (id: string, message: string) => plan.assumptions.push({ id, message })
  if (!context.venue) return ask('请先设置舞台宽度和深度。')
  const group = /^(?:一|1)?(?:组|套)桌椅$/.test(noun)
  const quantity = noun.match(new RegExp(`^(${countPattern})(?:张|把|个|件)(.+)$`))
  const count = quantity ? parseStageNumber(quantity[1]!) : 1
  const assetName = quantity?.[2] ?? noun
  const defaults: Record<string, string> = {
    沙发: 'SCN-SOFA-175',
    桌子: 'SCN-TABLE-090',
    椅子: 'SCN-CHAIR-045',
  }
  const specs = resolveStageObjectSpecs(assetName)
  const assetId = defaults[assetName] ?? (specs.length === 1 ? specs[0]!.canonicalId : null)
  if (!group && !assetId) return ask(`请明确“${noun}”的道具类型和数量。`)
  if (!group && count !== 1) return ask('请一次指定一件道具，或一组桌椅。')
  if (group) assume('region-assets', '一组桌椅暂按一张圆桌、两把硬椅预览。')
  else if (defaults[assetName]) {
    const name = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === assetId)?.asset.name
    assume('region-assets', `未指定款式，暂用${name}预览。`)
  }
  const side = region[2]!.includes('左') ? 1 : region[2]!.includes('右') ? -1 : 0
  const actorFrame = region[1] === '台' || region[1]?.startsWith('演员')
  const xSign = actorFrame ? -side : side
  const { widthMeters: width, depthMeters: depth } = context.venue
  const center = {
    x: (xSign * width) / 3,
    z: depth * (region[2]!.includes('前') ? 0.25 : region[2]!.includes('后') ? 0.75 : 0.5),
  }
  let wall: Wall | null = null
  if (region[3]) {
    const wallWord = region[3]!
    if (wallWord.includes('后')) wall = 'back'
    else if (wallWord.includes('前')) wall = 'front'
    else if (wallWord.includes('左') || wallWord.includes('右')) {
      const sign = (wallWord.includes('左') ? 1 : -1) * (actorFrame ? -1 : 1)
      wall = sign > 0 ? 'left' : 'right'
    } else if (region[2]!.includes('后')) wall = 'back'
    else if (region[2]!.includes('前')) wall = 'front'
    else if (xSign) wall = xSign > 0 ? 'left' : 'right'
    else return ask('要靠后墙、左墙还是右墙？左右按观众视角。')
    if (wall === 'front') return ask('台口朝观众开放；请明确要靠哪一块前方景片。')
    if (
      (wall === 'back' && region[2]!.includes('前')) ||
      (wall === 'left' && xSign <= 0) ||
      (wall === 'right' && xSign >= 0)
    )
      return ask('指定区域与要靠的墙不在同一侧，请确认区域或墙的位置。')
  }
  assume(
    'region-position',
    `${actorFrame ? '按演员方向' : '按观众视角'}放在${region[2]}区${wall ? '，靠墙摆放' : ''}；具体台位可在预览中调整。`,
  )
  const ids = group ? ['SCN-TABLE-090', 'SCN-CHAIR-045', 'SCN-CHAIR-045'] : [assetId!]
  for (const [index, id] of ids.entries()) {
    const source = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === id)
    if (!source?.asset.dimensions) return ask('这个标准道具尚未接入，请选用舞台库中的道具。')
    const [w, h, d] = source.asset.dimensions
    const dimensionsMeters = { width: w, height: h, depth: d }
    const item: StageItemProposal = {
      proposalId: createUUID(),
      existingNodeId: null,
      kind: source.kind,
      displayName: source.asset.name,
      libraryAssetId: id,
      dimensionsMeters,
      collisionGeometry: stagePropCollisionGeometry(id, dimensionsMeters),
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotationDegrees: {
          x: 0,
          y: group && index > 0 ? (index === 1 ? 90 : -90) : 180,
          z: 0,
        },
      },
      certainty: 'inferred',
      assumptionIds: plan.assumptions.map(({ id }) => id),
      evidenceIds: [],
    }
    const bounds = prepareStageCollision(item).bounds
    const tableWidth = plan.items[0]?.dimensionsMeters.width ?? 0
    const offset =
      group && index > 0
        ? (index === 1 ? -1 : 1) * (tableWidth / 2 + (bounds[0]![1] - bounds[0]![0]) / 2 + 0.2)
        : 0
    item.transform.position = {
      x: center.x + offset - (bounds[0]![0] + bounds[0]![1]) / 2,
      y: -bounds[1]![0],
      z: center.z - (bounds[2]![0] + bounds[2]![1]) / 2,
    }
    plan.items.push(item)
  }
  if (wall) {
    const axis = wall === 'back' ? 2 : 0
    const cross = axis === 2 ? 0 : 2
    const sign = wall === 'right' ? -1 : 1
    const bounds = plan.items.map((item) => prepareStageCollision(item).bounds)
    const low = Math.min(...bounds.map((b) => b[cross]![0]))
    const high = Math.max(...bounds.map((b) => b[cross]![1]))
    let limit = wall === 'back' ? depth : (sign * width) / 2
    let foundWall = false
    for (const object of context.objects) {
      if (!['scenic-flat', 'window-flat', 'door-flat', 'curtain', 'screen'].includes(object.kind))
        continue
      const b = prepareStageCollision(object).bounds
      if (b[cross]![1] < low || b[cross]![0] > high) continue
      const surface = b[axis]![sign > 0 ? 0 : 1]
      const wanted = axis === 2 ? center.z : center.x
      if ((surface - wanted) * sign <= 0) continue
      limit = sign > 0 ? Math.min(limit, surface) : Math.max(limit, surface)
      foundWall = true
    }
    // Contact the occupied wall face, not the pivot or the far side of a curtain.
    const edge =
      sign > 0
        ? Math.max(...bounds.map((b) => b[axis]![1]))
        : Math.min(...bounds.map((b) => b[axis]![0]))
    const delta = limit - edge - sign * 0.001
    for (const item of plan.items) item.transform.position[axis === 2 ? 'z' : 'x'] += delta
    if (!foundWall) assume('region-wall', '该处尚无墙片，暂靠舞台边界预览。')
  }
  const result = validateStagePlan(plan, context)
  const conflict = result.warnings.find(
    (warning) => warning.blocking || warning.code === 'collision',
  )
  if (conflict) return ask(`这个区域暂时放不下：${conflict.message} 请移开障碍或换一个区域。`)
  return result.plan
}
