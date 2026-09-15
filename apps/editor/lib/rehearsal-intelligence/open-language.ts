import {
  resolveStageObjectSpecs,
  type SceneContextSummary,
  StageItemKindSchema,
} from '@pascal-app/core/stage'
import { z } from 'zod'
import { type CameraIntentCommand, parseCameraIntent } from './camera-intents'
import { lookupCanonical } from './knowledge/retrieval'
import { resolveKnowledgeForProposal } from './knowledge/stage-proposal'
import { mapStagePlacementIntent, type StagePlacementProposal } from './stage-placement-actions'
import type { StagePlacementIntent } from './stage-placement-intents'

export const OPEN_CAMERA_IDS = [
  'top_orthographic',
  'elevated_perspective',
  'tilt_down',
  'raise_camera',
  'audience_view',
  'front_view',
  'orbit_left',
  'orbit_right',
  'focus_selection',
] as const
export const OPEN_INTENT_IDS = [
  'stage-left',
  'stage-right',
  'audience-left',
  'audience-right',
  'upstage',
  'downstage',
  'place-on',
  'stack-on',
  'connect-edge',
  'align-edges',
  'corner-angle',
  'fold-hinge',
  ...OPEN_CAMERA_IDS,
] as const
export const OPEN_CONSTRAINT_IDS = ['form-enclosure', 'leave-opening', 'preserve-path'] as const
export const OpenReferenceSchema = z.strictObject({
  kind: z.enum([
    'selection',
    'last',
    'named',
    'scenic_flats',
    'current_proposal',
    'current_ghost',
    'candidate',
  ]),
  text: z.string().max(160).nullable(),
  count: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  index: z.number().int().min(1).max(8).nullable(),
})
export const StructuredGroundingSchema = z.strictObject({
  rawUtterance: z.string().min(1).max(2000),
  subjects: z.array(OpenReferenceSchema).max(3),
  references: z.array(OpenReferenceSchema).max(3),
  intents: z.array(z.enum(OPEN_INTENT_IDS)).max(2),
  constraints: z.array(z.enum(OPEN_CONSTRAINT_IDS)).max(2),
  modifiers: z
    .array(
      z.enum([
        'wider',
        'keep_stage_left_fixed',
        'other_candidate',
        'reject',
        'smaller_angle',
        'correction',
      ]),
    )
    .max(2),
  ambiguities: z.array(z.string().min(1).max(300)).max(6),
  confidence: z.number().min(0).max(1),
  requiresClarification: z.boolean(),
  groundingVersion: z.literal('open-language-v01'),
  minimumWidthMeters: z.number().positive().max(1000).nullable(),
  angleDegrees: z.literal(90).nullable(),
  knowledgeConceptIds: z.array(z.string().min(1).max(160)).max(12),
})
export type StructuredGrounding = z.infer<typeof StructuredGroundingSchema>
export type OpenReference = z.infer<typeof OpenReferenceSchema>
export const DiaAppContextSchema = z.strictObject({
  page: z.literal('stage-editor'),
  route: z.string().max(300),
  capabilities: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(80),
        label: z.string().min(1).max(160),
        authority: z.enum(['read', 'manual_only', 'proposal_only']),
      }),
    )
    .max(24),
  settings: z.strictObject({
    viewMode: z.enum(['3d', '2d', 'split']),
    activePanel: z.string().max(80),
    workspaceMode: z.enum(['edit', 'studio']),
    transformMode: z.enum(['select', 'move', 'rotate']),
    rotationAxis: z.enum(['x', 'y', 'z']),
    cameraLocked: z.boolean(),
    placementMode: z.enum(['grid', 'edge_and_support', 'free']),
    gridStepCentimeters: z.number().positive().max(1000),
    gridVisible: z.boolean(),
    guidesVisible: z.boolean(),
    displayMode: z.enum(['white_model', 'black_box', 'material_preview']),
    stableMode: z.boolean(),
    immersiveMode: z.enum(['none', 'preview', 'capture', 'walkthrough']),
    readOnly: z.boolean(),
  }),
})
export type DiaAppContext = z.infer<typeof DiaAppContextSchema>
export const OpenLanguageContextSchema = z.strictObject({
  sceneVersion: z.string().min(1),
  objects: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        name: z.string().max(160),
        kind: StageItemKindSchema,
      }),
    )
    .max(500),
  selectedObjectIds: z.array(z.string()).max(20),
  lastReferencedIds: z.array(z.string()).max(3),
  proposal: z
    .strictObject({
      id: z.string(),
      subjectIds: z.array(z.string()).max(3),
      candidateIds: z.array(z.string()).max(8),
      selectedCandidateId: z.string().nullable(),
      ghostCandidateId: z.string().nullable(),
      hasEnclosure: z.boolean(),
      minimumWidthMeters: z.number().nullable(),
    })
    .nullable(),
  app: DiaAppContextSchema,
})
export type OpenLanguageContext = z.infer<typeof OpenLanguageContextSchema>
export const OpenLanguageRequestSchema = z.strictObject({
  rawUtterance: z.string().min(1).max(2000),
  context: OpenLanguageContextSchema,
})
export const OPEN_CONCEPTS: Record<string, string[]> = {
  'stage-left': ['stage-left'],
  'stage-right': ['stage-right'],
  'audience-left': ['audience-left'],
  'audience-right': ['audience-right'],
  upstage: ['upstage'],
  downstage: ['downstage'],
  'connect-edge': ['splice'],
  'align-edges': ['edge-align'],
  'corner-angle': ['angle', 'splice'],
  'fold-hinge': ['fold-flat', 'hinge'],
  'form-enclosure': ['enclosure', 'scenic-flat'],
  'leave-opening': ['opening'],
  'preserve-path': ['passage', 'entrance'],
  // Existing Placement authority, not invented Knowledge aliases.
  'place-on': [],
  'stack-on': [],
}
const ref = (
  kind: OpenReference['kind'],
  text: string | null = null,
  count: OpenReference['count'] = null,
  index: number | null = null,
): OpenReference => ({ kind, text, count, index })
export function emptyGrounding(rawUtterance: string): StructuredGrounding {
  return {
    rawUtterance,
    subjects: [],
    references: [],
    intents: [],
    constraints: [],
    modifiers: [],
    ambiguities: [],
    confidence: 0.95,
    requiresClarification: false,
    groundingVersion: 'open-language-v01',
    minimumWidthMeters: null,
    angleDegrees: null,
    knowledgeConceptIds: [],
  }
}
function clarify(g: StructuredGrounding, message: string) {
  return {
    ...g,
    intents: [],
    constraints: [],
    modifiers: [],
    requiresClarification: true,
    ambiguities: [message],
  }
}
const normalize = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/\s|[。！!？?]/g, '')
    .replace(/^(?:请|麻烦|劳驾|帮我)/, '')
    .replace(/给我/g, '')
const isFixedLeftRevision = (text: string) =>
  /^入口再宽一点[,，]但(?:台左|左边)景片不要动$/.test(text)
export function openLanguageSafetyIssue(raw: string): string | null {
  const text = normalize(raw)
  const fixedLeftRevision = isFixedLeftRevision(text)
  if (
    /开放一点|几块|几片|若干|随便|任意|或者|还是|然后|同时|压力|更美|压迫|灯光|开门扇|开一下门|飞起来|删除|部署|system|prompt|XYZ|坐标|忽略.*规则/i.test(
      text,
    )
  )
    return '这句话的范围、数量或能力不确定；请说明一个已支持的搭建要求。'
  if (
    /规定情境|戏剧情境|最高任务|潜台词|重音|气息|舞台事件|人物关系|调度|焦点|blocking|super.objective|given.circumstances/i.test(
      text,
    )
  )
    return '这是理论或暂未开放的能力，不能转换成搭建动作。'
  if (
    !fixedLeftRevision &&
    /(?:左边|右边|左侧|右侧)那(?:块|个)|^(?:往|向)?[左右](?:边|侧)?$/.test(text)
  )
    return '这里的左右按舞台、观众还是当前画面？请选中唯一对象并说明参考方向。'
  const corrected = text.replace(/^不是.+?[,，](?:我说的|我指的|而)?是/, '')
  const unframed = corrected.replace(/(?:舞台|观众(?:的)?|演员)[左右](?:边|侧|手边)?|台[左右]/g, '')
  if (
    !fixedLeftRevision &&
    !parseCameraIntent(corrected) &&
    !/按(?:舞台|观众)方向/.test(corrected) &&
    /[左右](?:边|侧|一点)|(?:往|向)[左右]/.test(unframed)
  )
    return '左右缺少明确参考方向；请说明台左台右或观众左观众右。'
  if (
    /[,，;；]/.test(corrected) &&
    !fixedLeftRevision &&
    !parseCameraIntent(corrected) &&
    !/^前面别封死[,，]留(?:个|一个)入口$/.test(corrected) &&
    !/^.+围.+[,，](?:中间|前面)?留(?:个|一个)?(?:\d+(?:\.\d+)?米宽)?入口$/.test(corrected)
  )
    return '这句话含有多个要求；请一次明确一个支持的搭建操作，不忽略附加子句。'
  if (
    /不要|别|不能|不许|不必/.test(corrected) &&
    !fixedLeftRevision &&
    !/^(?:前面别封死[,，]?)?(?:留(?:个|一个)?入口)?$/.test(corrected) &&
    !/^(?:别把入口堵上|不要封住入口|前面别封死|不要这个方案|不要了|别要这个方案)$/.test(
      corrected,
    ) &&
    !parseCameraIntent(corrected)
  )
    return '否定要求不会被当成肯定动作；请说明要保留或改成什么。'
  return null
}
function nounReference(noun: string): OpenReference {
  const text = noun.replace(/^(?:把|将|让|用|拿)/, '').replace(/^(?:这|那)(?:个|块|张|把|扇)/, '')
  if (/刚刚|刚才|上次/.test(text)) return ref('last')
  if (
    !text ||
    /^(?:它|这个|那个|这块|那块|选中的?物件|选中对象|选中的?景片|选中的?那个)$/.test(text)
  )
    return ref('selection')
  return ref('named', text)
}

/** Semantic features, not an utterance lookup table. Unknown clauses never become partial actions. */
export function parseOpenLanguage(rawUtterance: string): StructuredGrounding | null {
  let g = emptyGrounding(rawUtterance),
    text = normalize(rawUtterance)
  const fixedLeftRevision = isFixedLeftRevision(text)
  const issue = openLanguageSafetyIssue(rawUtterance)
  if (issue) return clarify(g, issue)
  if (/^(?:不是.+?[,，](?:我说的|我指的|而)?是)/.test(text)) {
    text = text.replace(/^不是.+?[,，](?:我说的|我指的|而)?是/, '')
    g.modifiers.push('correction')
  }
  if (fixedLeftRevision) {
    g.modifiers.push('wider', 'keep_stage_left_fixed')
    g.references = [ref('current_proposal')]
  } else if (/^(?:(?:再|稍微)?宽(?:一点|些)|入口加宽一点)$/.test(text)) {
    g.modifiers.push('wider')
    g.references = [ref('current_proposal')]
  } else if (/^(?:换|看)(?:另一个|另外一个|另一边)(?:方案)?$/.test(text)) {
    g.modifiers.push('other_candidate')
    g.references = [ref('current_ghost')]
  } else if (/^(?:角度|转角)(?:再)?小(?:一点|些)$/.test(text)) {
    return clarify(g, '当前只支持已验证的直墙、90 度转角与 U 型折叠，不能猜任意更小角度。')
  } else if (/^(?:不要了|不要这个方案|取消|算了|算了吧|放弃这个方案|别要这个方案)$/.test(text)) {
    g.modifiers.push('reject')
    g.references = [ref('current_proposal')]
  } else {
    const candidate = text.match(
      /^(?:看|看看|看一下|切到|切换到|预览|选)?第([一二三四五六七八12345678])个(?:方案)?$/,
    )
    if (candidate)
      g.references = [
        ref(
          'candidate',
          null,
          null,
          Number(candidate[1]) || '一二三四五六七八'.indexOf(candidate[1]!) + 1,
        ),
      ]
    else {
      const camera = parseCameraIntent(text.replace(/^切成/, '切到').replace(/^帮我/, ''))
      if (camera) {
        if (camera.clarify) return clarify(g, '你是想抬高视角，还是切换到正上方俯视图？')
        g.intents = camera.intents as StructuredGrounding['intents']
        if (camera.target && camera.target !== 'stage')
          g.subjects = [
            camera.target === 'table' || camera.target === 'selected_or_table'
              ? ref('named', '桌子')
              : ref('selection'),
          ]
      } else if (/三联|三折/.test(text) && /折|收/.test(text)) {
        if (!/^(?:把)?(?:三联|三折)景片(?:折(?:叠)?(?:成|为)?|收成)U[型形]$/i.test(text))
          return clarify(g, '请说明已验证的 U 型折叠，不猜铰链角度或忽略其他要求。')
        g.intents = ['fold-hinge']
        g.subjects = [ref('named', text.includes('三折') ? '三折景片' : '三联景片')]
        g.angleDegrees = 90
      } else if (/门(?:口|前).*(?:通道|能走人的路|能走人|过道|走人的路|一条路|条路)/.test(text)) {
        if (
          !/^门(?:口|前)留(?:出)?(?:一)?条?(?:\d+(?:\.\d+)?米(?:宽)?)?(?:通道|能走人的路|过道|走人的路|路)$/.test(
            text,
          )
        )
          return clarify(g, '请只说明门口通道及所需净宽。')
        g.constraints = ['preserve-path']
        g.references = [ref('named', '门')]
      } else if (/围|三面墙|U[形型]空间/i.test(text)) {
        if (/[四五六七八九十1456789几]+(?:块|片|面)|三联|三折/.test(text))
          return clarify(g, '当前围合需要唯一的三块独立景片。')
        if (
          !/^(?:(?:用|拿|把|让)?(?:两|二|2|三|3|仨)(?:块|片|个|面)?景片)?围(?:成|出)?(?:一个|个)?(?:空间|一下|一圈)?(?:[,，](?:中间|前面)?留(?:个|一个)?(?:\d+(?:\.\d+)?米宽)?入口)?$|^(?:弄|做)(?:个|一个)(?:三面墙|U[形型]空间)$/i.test(
            text,
          )
        )
          return clarify(g, '围合中的数量、修饰或附加要求不明确，请补充说明。')
        g.constraints = ['form-enclosure']
        g.subjects = [
          ref('scenic_flats', null, /(?:两|二|2)(?:块|片|个|面)?景片/.test(text) ? 2 : 3),
        ]
        if (/入口|留个口|别封死/.test(text)) g.constraints.push('leave-opening')
      } else if (
        /^(?:前面别封死[,，]?)?(?:留(?:个|一个)?(?:口|入口)|这里要能进去|别把入口堵上|不要封住入口|前面别封死)$/.test(
          text,
        )
      ) {
        g.constraints = ['leave-opening']
        g.references = [ref('current_proposal')]
      } else if (/景片/.test(text) && /直墙|一字|直线|拼直|边.*对齐|对齐.*边/.test(text)) {
        if (
          !/^(?:把|连接)?(?:两块)?景片(?:拼成直墙|摆成一字|拼直|对齐边|沿直线摆好|成直墙|连起来成直线|接起来拼直|接上一字排开|接上摆成一字)$/.test(
            text,
          )
        )
          return clarify(g, '请明确两块独立景片的接边或直墙要求。')
        g.intents = [/连接|接起来|接上|连起来/.test(text) ? 'connect-edge' : 'align-edges']
        g.subjects = [ref('scenic_flats', null, 2)]
      } else if (
        /景片/.test(text) &&
        /(?:90|九十)(?:度|°)|直角/.test(text) &&
        /拐|拼|接成|连成|摆成/.test(text)
      ) {
        if (
          !/^(?:把|让)?(?:两块)?景片(?:拐(?:成)?|拼(?:成|个)?|接成|连成|摆成)(?:90度|90°|九十度|直角)$/.test(
            text,
          )
        )
          return clarify(g, '请明确两块景片的 90 度转角；单块旋转或附加要求不自动采用。')
        g.intents = ['corner-angle']
        g.subjects = [ref('scenic_flats', null, 2)]
        g.angleDegrees = 90
      } else {
        const on = text.match(
          /^(.*?)(放到|放在|摆到|摆在|搁到|搁在|置于|叠到|叠在|叠放在|摞到|堆到|堆在)(.+?)(?:上面|顶上|顶部|上)$/,
        )
        const direction = text.match(
          /(台左|台右|演员左手边|演员右手边|舞台左侧|舞台右侧|观众(?:的)?左(?:边|侧)?|观众(?:的)?右(?:边|侧)?|台前|台后|舞台前区|舞台后区)$/,
        )
        if (on) {
          g.intents = [/叠|摞|堆/.test(on[2]!) ? 'stack-on' : 'place-on']
          g.subjects = [nounReference(on[1]!)]
          g.references = [nounReference(on[3]!)]
        } else if (direction) {
          const destination = direction[1]!
          g.intents = [
            /观众/.test(destination)
              ? /左/.test(destination)
                ? 'audience-left'
                : 'audience-right'
              : /左/.test(destination)
                ? 'stage-left'
                : /右/.test(destination)
                  ? 'stage-right'
                  : /前/.test(destination)
                    ? 'downstage'
                    : 'upstage',
          ]
          const noun = text
            .slice(0, direction.index)
            .replace(/(?:放到|放在|摆到|摆在|搁到|挪到|移到|搬到|往|向)$/, '')
          g.subjects = [nounReference(noun)]
        } else return null
      }
    }
  }
  const width = text.match(/(\d+(?:\.\d+)?)米(?:宽)?/)
  if (width) g.minimumWidthMeters = Number(width[1])
  g.knowledgeConceptIds = [
    ...new Set([...g.intents, ...g.constraints].flatMap((id) => OPEN_CONCEPTS[id] ?? [])),
  ]
  return StructuredGroundingSchema.parse(g)
}

export type ValidatedOpenGrounding = {
  grounding: StructuredGrounding
  subjectIds: string[]
  targetIds: string[]
  candidateId: string | null
}
export function validateOpenGrounding(
  raw: unknown,
  utterance: string,
  context: OpenLanguageContext,
): ValidatedOpenGrounding {
  const g = StructuredGroundingSchema.parse(raw),
    c = OpenLanguageContextSchema.parse(context)
  if (g.rawUtterance !== utterance) throw new Error('模型返回了另一条口令。')
  const all = [...g.intents, ...g.constraints]
  const expected = [...new Set(all.flatMap((id) => OPEN_CONCEPTS[id] ?? []))].sort()
  if (JSON.stringify([...g.knowledgeConceptIds].sort()) !== JSON.stringify(expected))
    throw new Error('Knowledge concept 与 canonical intent 不一致。')
  for (const id of g.knowledgeConceptIds) {
    const concept = lookupCanonical(id)
    if (!concept || concept.status !== 'ACTIVE' || concept.executionEligibility !== 'allowed')
      throw new Error('概念没有 ACTIVE + allowed 资格。')
  }
  if (
    g.requiresClarification ||
    g.ambiguities.length ||
    g.confidence < 0.8 ||
    openLanguageSafetyIssue(utterance)
  )
    throw new Error(
      g.ambiguities[0] ?? openLanguageSafetyIssue(utterance) ?? '请补充一个明确要求。',
    )
  const deterministic = parseOpenLanguage(utterance)
  if (deterministic) {
    if (deterministic.requiresClarification) throw new Error(deterministic.ambiguities[0])
    for (const field of [
      'subjects',
      'references',
      'intents',
      'constraints',
      'modifiers',
      'minimumWidthMeters',
      'angleDegrees',
    ] as const)
      if (JSON.stringify(g[field]) !== JSON.stringify(deterministic[field]))
        throw new Error('模型不能覆盖已确定的语义或丢失明确修饰。')
  }
  if (
    new Set(all).size !== all.length ||
    (g.intents.length > 1 && !g.intents.every((id) => OPEN_CAMERA_IDS.includes(id as never))) ||
    (g.intents.length && g.constraints.length) ||
    (g.modifiers.some((m) => m !== 'correction') && all.length)
  )
    throw new Error('V0.1 不合并多个独立操作。')
  if (
    g.angleDegrees !== null &&
    !g.intents.some((id) => id === 'corner-angle' || id === 'fold-hinge')
  )
    throw new Error('角度字段不能变成任意整件旋转。')
  if (g.intents.some((id) => id === 'corner-angle' || id === 'fold-hinge') && g.angleDegrees !== 90)
    throw new Error('必须使用已验证的 90 度语义。')
  if (
    g.minimumWidthMeters !== null &&
    !g.constraints.some((id) => id === 'leave-opening' || id === 'preserve-path')
  )
    throw new Error('宽度只能约束入口或通道。')
  const statedWidth = utterance.normalize('NFKC').match(/([+-]?\d+(?:\.\d+)?)米/)
  if (
    (g.minimumWidthMeters !== null ||
      (statedWidth &&
        g.constraints.some((id) => id === 'leave-opening' || id === 'preserve-path'))) &&
    (!statedWidth || Number(statedWidth[1]) !== g.minimumWidthMeters)
  )
    throw new Error('入口或通道净宽必须保留口令明确给出的米数；不得由模型发明或省略。')
  if (
    g.constraints.length > 1 &&
    !(g.constraints.includes('form-enclosure') && g.constraints.includes('leave-opening'))
  )
    throw new Error('不能合并这些约束。')
  const objects = new Map(c.objects.map((item) => [item.id, item]))
  if (
    objects.size !== c.objects.length ||
    [...c.selectedObjectIds, ...c.lastReferencedIds].some((id) => !objects.has(id))
  )
    throw new Error('引用的物件已不存在。')
  let candidateId: string | null = null
  const resolve = (r: OpenReference): string[] => {
    if (
      (r.kind === 'named') !== (r.text !== null) ||
      (r.kind === 'candidate') !== (r.index !== null)
    )
      throw new Error('引用字段与引用类型不一致。')
    if (['current_proposal', 'current_ghost', 'candidate'].includes(r.kind)) {
      if (!c.proposal || (r.kind === 'current_ghost' && !c.proposal.ghostCandidateId))
        throw new Error('没有当前提案或 Ghost 可引用。')
      if (r.kind === 'candidate') {
        candidateId = c.proposal.candidateIds[(r.index ?? 0) - 1] ?? null
        if (!candidateId) throw new Error('没有这个候选方案。')
      }
      return c.proposal.subjectIds
    }
    let ids: string[]
    if (r.kind === 'selection')
      ids = c.selectedObjectIds.length ? c.selectedObjectIds : c.lastReferencedIds
    else if (r.kind === 'last') ids = c.lastReferencedIds
    else if (r.kind === 'scenic_flats') {
      const flats = c.objects.filter((item) => /flat/.test(item.kind))
      const selected = flats.filter((item) => c.selectedObjectIds.includes(item.id))
      ids = (selected.length ? selected : flats).map((item) => item.id)
    } else {
      if (!r.text || !normalize(utterance).includes(normalize(r.text)))
        throw new Error('对象名称没有口令依据。')
      const exact = c.objects.filter((item) => item.name === r.text || item.id === r.text)
      const kinds = resolveStageObjectSpecs(r.text).map((spec) => spec.kind)
      const matches = exact.length
        ? exact
        : c.objects.filter((item) => kinds.includes(item.kind as never))
      const selected = matches.filter((item) => c.selectedObjectIds.includes(item.id))
      ids = (selected.length ? selected : matches).map((item) => item.id)
    }
    if (ids.length !== (r.count ?? 1) || ids.some((id) => !objects.has(id)))
      throw new Error('没有唯一且数量匹配的对象，请明确选择。')
    return ids
  }
  const subjectIds = g.subjects.flatMap(resolve),
    targetIds = g.references.flatMap(resolve)
  const explicitNoun = normalize(utterance).match(
    /^(?:把|将)(.+?)(?:叠放在|放到|放在|摆到|挪到|搬到|移到|叠到)/,
  )?.[1]
  if (
    explicitNoun &&
    !/^(?:它|这个|那个|这块|那块|选中的物件)$/.test(explicitNoun) &&
    !g.subjects.some((r) => r.kind === 'named' && r.text === explicitNoun)
  )
    throw new Error('明确对象不能被替换成默认选中对象。')
  const requiredSubjects = g.constraints.includes('form-enclosure')
    ? /(?:两|二|2)(?:块|片|个|面)/.test(utterance.normalize('NFKC'))
      ? 2
      : 3
    : g.intents.some((id) => ['connect-edge', 'align-edges', 'corner-angle'].includes(id))
      ? 2
      : g.intents.some((id) => !OPEN_CAMERA_IDS.includes(id as never))
        ? 1
        : null
  if (
    requiredSubjects !== null &&
    (subjectIds.length !== requiredSubjects || new Set(subjectIds).size !== requiredSubjects)
  )
    throw new Error('操作缺少数量匹配的唯一主体。')
  if (g.constraints.includes('preserve-path') && targetIds.length !== 1)
    throw new Error('通道需要唯一入口。')
  if (
    g.intents.some((id) => ['place-on', 'stack-on'].includes(id)) &&
    (subjectIds.length !== 1 || targetIds.length !== 1 || subjectIds[0] === targetIds[0])
  )
    throw new Error('需要两个不同的明确物件。')
  if (
    g.constraints.includes('leave-opening') &&
    !g.constraints.includes('form-enclosure') &&
    !c.proposal?.hasEnclosure
  )
    throw new Error('请先明确要在哪个围合方案中留入口。')
  if (g.modifiers.includes('wider') && c.proposal?.minimumWidthMeters == null)
    throw new Error('请先说明要加宽哪个入口或通道。')
  if (g.modifiers.includes('other_candidate')) {
    if (!c.proposal || c.proposal.candidateIds.length < 2) throw new Error('没有另一个合法候选。')
    const current = c.proposal.candidateIds.indexOf(c.proposal.selectedCandidateId!)
    candidateId = c.proposal.candidateIds[(current + 1) % c.proposal.candidateIds.length]!
  }
  if (!all.length && !candidateId && !g.modifiers.some((m) => m === 'reject' || m === 'wider'))
    throw new Error('没有已支持的明确操作。')
  return { grounding: g, subjectIds, targetIds, candidateId }
}

/** Adapter emits existing semantic Placement instructions, never positions or transforms. */
export function openGroundingPlacement(
  value: ValidatedOpenGrounding,
  snapshot: SceneContextSummary,
): StagePlacementProposal | CameraIntentCommand {
  const { grounding: g, subjectIds, targetIds } = value,
    id = g.intents[0]
  if (id && OPEN_CAMERA_IDS.includes(id as never))
    return {
      type: 'CAMERA_INTENT',
      intents: g.intents as CameraIntentCommand['intents'],
      clarify: false,
      ...(g.subjects.length
        ? { target: g.subjects[0]?.kind === 'named' ? ('table' as const) : ('selection' as const) }
        : {}),
      ...(id === 'top_orthographic'
        ? { projection: 'orthographic' as const }
        : ['elevated_perspective', 'tilt_down', 'raise_camera'].includes(id)
          ? { projection: 'perspective' as const }
          : {}),
    }
  let intent: StagePlacementIntent = {
    kind: 'ambiguous',
    subject: subjectIds[0] ?? '$selection',
    clarify: false,
  }
  if (g.constraints.includes('form-enclosure'))
    intent = {
      ...intent,
      kind: 'enclose_with_opening',
      count: subjectIds.length,
      shape: 'enclosure',
      openingRequired: g.constraints.includes('leave-opening'),
    }
  else if (g.constraints.includes('preserve-path'))
    intent = { ...intent, kind: 'preserve_path', subject: '$stage', target: targetIds[0] }
  else if (id === 'connect-edge' || id === 'align-edges' || id === 'corner-angle')
    intent = {
      ...intent,
      kind: 'connect_flats',
      count: 2,
      angleDegrees: id === 'corner-angle' ? 90 : 0,
      shape: id === 'corner-angle' ? 'corner' : 'straight',
    }
  else if (id === 'fold-hinge')
    intent = { ...intent, kind: 'fold_hinge', shape: 'u', angleDegrees: 90 }
  else if (id === 'place-on' || id === 'stack-on')
    intent = { ...intent, kind: id === 'place-on' ? 'place_on' : 'stack_on', target: targetIds[0] }
  else if (
    id &&
    [
      'stage-left',
      'stage-right',
      'audience-left',
      'audience-right',
      'upstage',
      'downstage',
    ].includes(id)
  )
    intent = {
      ...intent,
      kind: id.replace('-', '_') as StagePlacementIntent['kind'],
      frame: id.startsWith('audience') ? 'audience' : 'stage',
      motion: 'region',
    }
  if (g.minimumWidthMeters !== null) intent.amountMeters = g.minimumWidthMeters
  const placement = mapStagePlacementIntent(intent, { ...snapshot, selectedObjectIds: subjectIds })
  if (placement.status !== 'proposal') throw new Error(placement.message)
  placement.knowledgeProposal = resolveKnowledgeForProposal(g.rawUtterance, placement, snapshot)
  return placement
}
