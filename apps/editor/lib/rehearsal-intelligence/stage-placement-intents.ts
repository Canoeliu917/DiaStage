import { parseStageLength } from '@pascal-app/core/stage'

export type PlacementKind =
  | 'stage_left'
  | 'stage_right'
  | 'audience_left'
  | 'audience_right'
  | 'relative_left'
  | 'relative_right'
  | 'left_of_object'
  | 'right_of_object'
  | 'upstage'
  | 'downstage'
  | 'near_object'
  | 'flush_to_object'
  | 'place_on'
  | 'stack_on'
  | 'center_on_stage'
  | 'align'
  | 'preserve_clearance'
  | 'preserve_path'
  | 'ambiguous'
export type PlacementFrame = 'stage' | 'audience' | 'unspecified'
export type StagePlacementIntent = {
  kind: PlacementKind
  subject: string
  target?: string
  frame?: PlacementFrame
  motion?: 'region' | 'relative'
  amountMeters?: number
  axis?: 'x' | 'z'
  region?: 'center'
  clarify: boolean
  message?: string
}
const reference = (text: string) =>
  /^(?:选中(?:的)?(?:物件|物品|对象|布景)|这组)$/.test(text) ? '$selection' : text
const ambiguous = (message: string): StagePlacementIntent => ({
  kind: 'ambiguous',
  subject: '$selection',
  clarify: true,
  message,
})
const placeVerb = '(?:放到|放在|移到|移至|摆到|摆在|置于)'

export function parseStagePlacementIntent(input: string): StagePlacementIntent | null {
  let text = input
    .normalize('NFKC')
    .trim()
    .replace(/\s/g, '')
    .replace(/[。！!]$/, '')
    .replace(/^请/, '')
    .replace(/^(?:把|将)/, '')
  const perspective = text.match(/^按(舞台|观众)方向/)
  const frame: PlacementFrame = perspective
    ? perspective[1] === '舞台'
      ? 'stage'
      : 'audience'
    : 'unspecified'
  if (perspective) text = text.slice(perspective[0].length).replace(/^(?:把|将)/, '')
  if (!text || text.length > 2000 || /^(?:给我|我要|添加|增加|放入|新建|创建)/.test(text))
    return null
  const related =
    /台左|台右|台前|台后|观众[的左右]|舞台|靠近|附近|紧贴|贴着|放[到在]|摆[到在]|叠|对齐|排齐|留空|留白|通道|往[左右]|向[左右]|层次/.test(
      text,
    )
  if (related && /不要|不能|别|不必|还是|或者|然后|再|[，,；;]/.test(text))
    return ambiguous('请先说明一个确定的摆放要求；否定、备选和连续操作暂不合并执行。')
  if (/^(?:放到|放在|移到|移至|摆到|摆在|置于|叠放在|堆叠到|叠在|靠近|紧贴|贴着)/.test(text))
    text = `$selection${text}`
  const make = (
    kind: PlacementKind,
    subject: string,
    fields: Partial<StagePlacementIntent> = {},
  ): StagePlacementIntent => ({ kind, subject: reference(subject), clarify: false, ...fields })
  let match = text.match(/^(?:在)?(?:舞台)?(?:中央|中间)(?:留空|留白|留出(.+?)空隙)$/)
  if (match) {
    const amount = match[1] ? parseStageLength(match[1]) : undefined
    if (amount === null || (amount !== undefined && amount <= 0))
      return ambiguous('请说明有效的留空宽度。')
    return make('preserve_clearance', '$stage', {
      region: 'center',
      ...(amount !== undefined ? { amountMeters: amount } : {}),
    })
  }
  match = text.match(/^(?:在)?(.+?)(?:口|前)(?:留通道|保留通道|留出(.+?)通道)$/)
  if (match) {
    const amount = match[2] ? parseStageLength(match[2]) : undefined
    if (amount === null || (amount !== undefined && amount <= 0))
      return ambiguous('请说明有效的通道宽度。')
    return make('preserve_path', '$stage', {
      target: match[1]!,
      ...(amount !== undefined ? { amountMeters: amount } : {}),
    })
  }
  match = text.match(/^(.+?)(?:沿)?(横向|纵向)(?:对齐|排齐)$/)
  if (match) return make('align', match[1]!, { axis: match[2] === '横向' ? 'x' : 'z' })
  if (/对齐|排齐/.test(text)) return ambiguous('要对齐哪些物件，沿横向还是纵向？')
  match = text.match(
    /^(.*?)(?:往|向)?(左|右)(?:移动|挪动|移|挪)?(一点|少许|[+-]?[\d.零〇一二两三四五六七八九十百千万点半]+(?:毫米|厘米|公分|米|mm|cm|m)(?:半)?)$/,
  )
  if (match && !/(?:台|观众(?:的)?)$/.test(match[1]!)) {
    const amount = /一点|少许/.test(match[3]!) ? undefined : parseStageLength(match[3]!)
    if (amount === null || (amount !== undefined && amount <= 0))
      return ambiguous('请用正数说明移动距离，方向单独说明。')
    return make(match[2] === '左' ? 'relative_left' : 'relative_right', match[1] || '$selection', {
      frame,
      motion: 'relative',
      ...(amount !== undefined ? { amountMeters: amount } : {}),
    })
  }
  match = text.match(
    new RegExp(
      `^(.+?)${placeVerb}(台[左右前后]|舞台[左右]侧|舞台[前后]区|观众的?[左右](?:侧|边)?|舞台中央|舞台中区|台中)$`,
    ),
  )
  if (match) {
    const location = match[2]!
    const audience = location.startsWith('观众')
    const kind = /左/.test(location)
      ? audience
        ? 'audience_left'
        : 'stage_left'
      : /右/.test(location)
        ? audience
          ? 'audience_right'
          : 'stage_right'
        : /后/.test(location)
          ? 'upstage'
          : /前/.test(location)
            ? 'downstage'
            : 'center_on_stage'
    return make(kind, match[1]!, { frame: audience ? 'audience' : 'stage', motion: 'region' })
  }
  match = text.match(new RegExp(`^(.+?)${placeVerb}(.+?)(?:的)?([左右])(?:边|侧)$`))
  if (match)
    return make(match[3] === '左' ? 'left_of_object' : 'right_of_object', match[1]!, {
      target: match[2]!,
      frame,
    })
  match = text.match(new RegExp(`^(.+?)(叠放在|堆叠到|叠在|${placeVerb})(.+?)(上|上面|表面)$`))
  if (match)
    return make(/叠/.test(match[2]!) ? 'stack_on' : 'place_on', match[1]!, { target: match[3]! })
  match = text.match(/^(.+?)(靠近|紧贴|贴着)(.+)$/)
  if (match)
    return make(match[2] === '靠近' ? 'near_object' : 'flush_to_object', match[1]!, {
      target: match[3]!,
    })
  match = text.match(new RegExp(`^(.+?)${placeVerb}(.+?)(附近|旁边|旁并紧贴)$`))
  if (match)
    return make(match[3] === '旁并紧贴' ? 'flush_to_object' : 'near_object', match[1]!, {
      target: match[2]!,
    })
  if (/上面|上方|[左右]边$|层次/.test(text))
    return ambiguous('请说明要移动的物件、参照对象和方向；“上面”是悬在上方还是接触支撑面？')
  return null
}
