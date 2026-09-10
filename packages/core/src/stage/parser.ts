import { resolveStagePlan, stageObjectBounds } from './plan'
import {
  type ClarificationAnswer,
  type SceneContextSummary,
  SceneContextSummarySchema,
  type StageDimensions,
  type StageItemKind,
  type StageItemProposal,
  type StagePlan,
  StagePlanSchema,
  type StageTransform,
  type VenueProposal,
} from './schema'

const digits: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}
const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 }
const numberPattern = '[+-]?(?:\\d+(?:\\.\\d+)?|[零〇一二两三四五六七八九十百千万点半]+)'
const lengthPattern = `(?:${numberPattern})(?:厘米|公分|cm|米|m)(?:半)?`
const directions = {
  台右: 'stage-right',
  台左: 'stage-left',
  台后: 'upstage',
  台前: 'downstage',
} as const
type DirectionName = keyof typeof directions
const directionPattern = '(台左|台右|台前|台后)'

export function parseStageNumber(input: string): number | null {
  const text = input.trim()
  if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) {
    const value = Number(text)
    return Number.isFinite(value) ? value : null
  }
  if (text === '半') return 0.5
  const sign = text.startsWith('-') ? -1 : 1
  const unsigned = text.replace(/^[+-]/, '')
  if (!/^[零〇一二两三四五六七八九十百千万]+(?:点[零〇一二两三四五六七八九]+)?$/.test(unsigned))
    return null
  const [integer = '', decimal] = unsigned.split('点')
  let value = 0
  if (![...integer].some((character) => character in units)) {
    value = Number([...integer].map((character) => digits[character]).join(''))
  } else {
    let section = 0,
      digit = 0,
      lastUnit = Infinity
    for (const character of integer) {
      if (character in digits) {
        digit = digits[character]!
        continue
      }
      const unit = units[character]!
      if (unit === 10000) {
        if (value !== 0) return null
        value = (section + digit) * unit
        section = 0
        digit = 0
        lastUnit = Infinity
      } else {
        if (unit >= lastUnit) return null
        section += (digit || 1) * unit
        digit = 0
        lastUnit = unit
      }
    }
    if (lastUnit >= 100 && digit > 0 && !/[零〇][一二两三四五六七八九]$/.test(integer)) return null
    value += section + digit
  }
  if (decimal) value += Number(`0.${[...decimal].map((character) => digits[character]).join('')}`)
  return Number.isFinite(value) ? sign * value : null
}

export function parseStageLength(input: string): number | null {
  const match = input
    .replace(/\s/g, '')
    .toLowerCase()
    .match(new RegExp(`^(${numberPattern})(厘米|公分|cm|米|m)(半)?$`))
  if (!match) return null
  const number = parseStageNumber(match[1]!)
  if (number === null) return null
  const value = number + (match[3] ? (number < 0 ? -0.5 : 0.5) : 0)
  return value * (['厘米', '公分', 'cm'].includes(match[2]!) ? 0.01 : 1)
}

const defaults: { aliases: string[]; kind: StageItemKind; dimensions: StageDimensions }[] = [
  {
    aliases: ['双人沙发', '沙发'],
    kind: 'sofa',
    dimensions: { width: 2, height: 0.85, depth: 0.9 },
  },
  {
    aliases: ['窗景片', '窗户', '窗'],
    kind: 'window-flat',
    dimensions: { width: 1.2, height: 2.1, depth: 0.15 },
  },
  {
    aliases: ['门景片', '门'],
    kind: 'door-flat',
    dimensions: { width: 0.9, height: 2.1, depth: 0.15 },
  },
  {
    aliases: ['景片', '景墙'],
    kind: 'scenic-flat',
    dimensions: { width: 2, height: 2.4, depth: 0.15 },
  },
  {
    aliases: ['圆桌', '桌子', '桌'],
    kind: 'table',
    dimensions: { width: 1.2, height: 0.75, depth: 1.2 },
  },
  { aliases: ['椅子', '椅'], kind: 'chair', dimensions: { width: 0.5, height: 0.85, depth: 0.5 } },
  { aliases: ['平台', '台件'], kind: 'platform', dimensions: { width: 2, height: 0.3, depth: 1 } },
  {
    aliases: ['舞台台阶', '踏步', '台阶', '楼梯'],
    kind: 'stairs',
    dimensions: { width: 1.2, height: 0.45, depth: 0.9 },
  },
  { aliases: ['屏风'], kind: 'screen', dimensions: { width: 1.5, height: 2, depth: 0.15 } },
  { aliases: ['幕', '幕布'], kind: 'curtain', dimensions: { width: 3, height: 2.5, depth: 0.05 } },
  {
    aliases: ['栏杆', '隔断'],
    kind: 'rail-or-divider',
    dimensions: { width: 2, height: 1, depth: 0.15 },
  },
  { aliases: ['柜台'], kind: 'counter', dimensions: { width: 1.5, height: 0.9, depth: 0.6 } },
  { aliases: ['书架', '搁板'], kind: 'shelf', dimensions: { width: 1, height: 2, depth: 0.4 } },
  { aliases: ['床'], kind: 'bed', dimensions: { width: 1.5, height: 0.5, depth: 2 } },
  {
    aliases: ['体块', '方块'],
    kind: 'neutral-block',
    dimensions: { width: 1, height: 1, depth: 1 },
  },
  {
    aliases: ['摄影机', '摄像机', '舞台镜头'],
    kind: 'camera',
    dimensions: { width: 0.3, height: 0.3, depth: 0.3 },
  },
  {
    aliases: ['人物标记'],
    kind: 'performer-marker',
    dimensions: { width: 0.4, height: 1.7, depth: 0.4 },
  },
]

type Candidate = {
  id: string
  name: string
  kind: StageItemKind
  dimensionsMeters: StageDimensions
  transform: StageTransform
  stepCount?: number
  proposal: StageItemProposal | null
}

export function parseStageText(
  input: string,
  sceneContext: SceneContextSummary,
  priorAnswers: ClarificationAnswer[] = [],
  source: 'voice' | 'typed-command' = 'typed-command',
): StagePlan | null {
  const context = SceneContextSummarySchema.parse(sceneContext)
  const plan: StagePlan = {
    schemaVersion: 1,
    source,
    venue: null,
    items: [],
    relations: [],
    assumptions: [],
    questions: [],
    evidence: [],
    warnings: [],
  }
  const answer = (id: string) =>
    [...priorAnswers]
      .reverse()
      .find((entry) => entry.questionId === id)
      ?.answer.trim()
  const ask = (id: string, message: string, options: string[] = []) => {
    if (!plan.questions.some((question) => question.id === id))
      plan.questions.push({ id, message, options: options.slice(0, 6) })
  }
  const text = input.normalize('NFKC').replace(/\s/g, '').replace(/、/g, '').replace(/[.]$/, '')
  if (!text || text.length > 20000) return null
  if (
    /(灯|照明|光束|屋顶|暖通|机电|厨房|卫浴|装修|房间|场次|节拍|人物心理|导演阐释|道具表|CueStack|\b(?:lighting|lamp|roof|HVAC|room|scene|beat|objective)\b)/i.test(
      text,
    )
  ) {
    ask(
      'unsupported-domain',
      '舞台口令只处理舞台空间、布景、人物标记和摄影机。请移除这条口令中的其他功能要求。',
    )
    return plan
  }
  const align = text.match(
    /^(?:把|将)?(?:选中(?:的)?(?:布景|对象)|这组)(?:沿)?(台口|台后|台左|台右)(?:边缘)?对齐[。]?$/,
  )
  const distribute = text.match(
    new RegExp(
      `^(?:把|将)?(?:选中(?:的)?(?:布景|对象)|这组)(?:沿)?(横向|纵向)(?:按)?(${lengthPattern})净距(?:等距)?分布[。]?$`,
    ),
  )
  const scale = text.match(
    new RegExp(
      `^(?:把|将)?(?:选中(?:的)?(?:布景|对象)|这组)(?:缩放到|放大到|缩小到)(${numberPattern})倍[。]?$`,
    ),
  )
  if (align || distribute || scale) {
    const selected = context.objects.filter((object) =>
      context.selectedObjectIds.includes(object.id),
    )
    if (selected.length < (scale ? 1 : 2)) {
      ask('select-layout', scale ? '请先选中布景。' : '请先选中至少两个布景。')
      return plan
    }
    const axis =
      distribute?.[1] === '横向' || (align && ['台左', '台右'].includes(align[1]!)) ? 'x' : 'z'
    const low = axis === 'x' ? 'minX' : 'minZ',
      high = axis === 'x' ? 'maxX' : 'maxZ'
    const ordered = [...selected].sort(
      (a, b) => stageObjectBounds(a)[low] - stageObjectBounds(b)[low] || a.id.localeCompare(b.id),
    )
    const far = align && ['台后', '台右'].includes(align[1]!)
    const edge = far
      ? Math.max(...ordered.map((object) => stageObjectBounds(object)[high]))
      : Math.min(...ordered.map((object) => stageObjectBounds(object)[low]))
    const spacing = distribute ? parseStageLength(distribute[2]!) : 0
    const factor = scale ? parseStageNumber(scale[1]!) : 1
    if (spacing === null || spacing < 0 || factor === null || factor <= 0) {
      ask('layout-value', '请输入有效的非负净距或正数缩放倍数。')
      return plan
    }
    let cursor = edge
    plan.items = ordered.map((object, index) => {
      const transform = structuredClone(object.transform)
      const bounds = stageObjectBounds(object)
      if (align) transform.position[axis] += edge - bounds[far ? high : low]
      if (distribute) {
        transform.position[axis] += cursor - bounds[low]
        cursor += bounds[high] - bounds[low] + spacing
      }
      return {
        proposalId: `layout-${index}`,
        existingNodeId: object.id,
        kind: object.kind,
        displayName: object.name,
        libraryAssetId: null,
        transform,
        dimensionsMeters: {
          width: object.dimensionsMeters.width * factor,
          height: object.dimensionsMeters.height * factor,
          depth: object.dimensionsMeters.depth * factor,
        },
        certainty: 'stated',
        assumptionIds: [],
        evidenceIds: [],
      }
    })
    return StagePlanSchema.parse(plan)
  }
  const clauses = text.split(/[。！？；;\n，,]/).filter(Boolean)
  for (let i = 0; i < clauses.length - 1; i++) {
    if (/^(深|高)/.test(clauses[i + 1]!) && /(宽|深)/.test(clauses[i]!)) {
      clauses.splice(i, 2, `${clauses[i]}${clauses[i + 1]}`)
      i--
    } else if (/^复制/.test(clauses[i]!) && /^(放到|放在|移到|移至)/.test(clauses[i + 1]!)) {
      clauses.splice(i, 2, `${clauses[i]}${clauses[i + 1]}`)
    }
  }
  const candidates = (): Candidate[] => [
    ...plan.items.map((proposal) => ({
      id: proposal.proposalId,
      name: proposal.displayName,
      kind: proposal.kind,
      stepCount: proposal.stepCount ?? undefined,
      dimensionsMeters: proposal.dimensionsMeters,
      transform: proposal.transform,
      proposal,
    })),
    ...context.objects
      .filter((item) => !plan.items.some((proposal) => proposal.existingNodeId === item.id))
      .map((item) => ({ ...item, proposal: null })),
  ]
  const select = (token: string, id: string): Candidate | null => {
    const list = candidates()
    const selected = context.selectedObjectIds.length === 1 ? context.selectedObjectIds[0] : null
    const pronoun = /^(它|这个|那个|这[把张块台扇个]|那[把张块台扇个])/.test(token)
    const noun = token.replace(/^(?:它|这个|那个|这[把张块台扇个]|那[把张块台扇个])/, '')
    const kind = defaults.find((entry) => entry.aliases.includes(noun))?.kind
    let matches = list.filter((item) => item.name === token)
    if (pronoun)
      matches = list.filter(
        (item) =>
          (item.id === selected || item.proposal?.existingNodeId === selected) &&
          (!noun || item.name === noun || item.kind === kind),
      )
    else if (matches.length === 0 && kind) matches = list.filter((item) => item.kind === kind)
    const choice = answer(id)
    if (choice) {
      const exact = (matches.length ? matches : list).filter(
        (item) =>
          choice === item.id || choice === `${item.name}（${item.id}）` || choice === item.name,
      )
      if (exact.length === 1) return exact[0]!
    }
    if (matches.length === 1) return matches[0]!
    ask(
      id,
      pronoun ? '请先选中唯一对象，或明确这次要修改哪一个。' : `“${token}”指哪一个舞台对象？`,
      (matches.length ? matches : list).map((item) => `${item.name}（${item.id}）`),
    )
    return null
  }
  const upsert = (candidate: Candidate): StageItemProposal => {
    if (candidate.proposal) return candidate.proposal
    const proposal: StageItemProposal = {
      proposalId: `proposal-${plan.items.length + 1}`,
      existingNodeId: candidate.id,
      kind: candidate.kind,
      stepCount: candidate.stepCount,
      displayName: candidate.name,
      libraryAssetId: null,
      dimensionsMeters: structuredClone(candidate.dimensionsMeters),
      transform: structuredClone(candidate.transform),
      certainty: 'stated',
      assumptionIds: [],
      evidenceIds: [],
    }
    plan.items.push(proposal)
    return proposal
  }
  const create = (noun: string): StageItemProposal | null => {
    let name = noun.replace(/^(?:一个|一块|一张|一把|一台|一扇|一座|1个|1块|1张|1把|1台)/, '')
    const steps = name.match(new RegExp(`^(${numberPattern})级(?:舞台)?(?:台阶|踏步)$`))
    const count = steps ? parseStageNumber(steps[1]!) : 3
    if (steps) name = '舞台台阶'
    if (count === null || !Number.isInteger(count) || count < 1 || count > 200) {
      ask('step-count', '台阶级数必须是 1 至 200 的整数。')
      return null
    }
    const definition = defaults.find((entry) => entry.aliases.includes(name))
    if (!definition) return null
    const id = `proposal-${plan.items.length + 1}`
    const assumptionId = `size-${id}`
    const dimensions =
      definition.kind === 'stairs'
        ? { width: 1.2, height: count * 0.15, depth: count * 0.3 }
        : { ...definition.dimensions }
    plan.assumptions.push({
      id: assumptionId,
      message: `${name} 未指定尺寸，暂按宽 ${dimensions.width}、高 ${dimensions.height}、深 ${dimensions.depth} 米。`,
    })
    const proposal: StageItemProposal = {
      proposalId: id,
      existingNodeId: null,
      kind: definition.kind,
      ...(definition.kind === 'stairs' ? { stepCount: count } : {}),
      displayName: name,
      libraryAssetId: null,
      dimensionsMeters: dimensions,
      transform: {
        position: {
          x: 0,
          y: 0,
          z: (plan.venue ?? context.venue)?.depthMeters
            ? (plan.venue ?? context.venue)!.depthMeters / 2
            : 0,
        },
        rotationDegrees: { x: 0, y: 0, z: 0 },
      },
      certainty: 'inferred',
      assumptionIds: [assumptionId],
      evidenceIds: [],
    }
    plan.items.push(proposal)
    return proposal
  }
  const gap = (text: string, id: string): number | null => {
    const word = text.replace(/^并/, '')
    if (['紧贴', '紧邻', '相邻', '贴着'].includes(word)) return 0
    if (word) return parseStageLength(word)
    plan.assumptions.push({ id, message: '未指定布景间距，预览暂留 0.3 米，可在确认前修改。' })
    return 0.3
  }
  const relation = (
    subject: StageItemProposal,
    reference: Candidate,
    direction: DirectionName,
    distance: number,
  ) => {
    plan.relations.push({
      id: `relation-${plan.relations.length + 1}`,
      subjectId: subject.proposalId,
      referenceId: reference.id,
      direction: directions[direction],
      gapMeters: distance,
    })
  }
  for (let index = 0; index < clauses.length; index++) {
    let clause = clauses[index]!.replace(/^请/, '')
      .replace(/^将/, '把')
      .replace(/^在舞台中区/, '舞台中区')
      .replace(/(平台)前方$/, '$1台前')
    const atSide = clause.match(/^(?:在)?(台左|台右|台前|台后)(?:增加|添加|放置)(.+)$/)
    if (atSide) {
      const created = create(atSide[2]!)
      if (!created) return plan.questions.length ? plan : null
      plan.relations.push({
        id: `relation-${plan.relations.length + 1}`,
        subjectId: created.proposalId,
        referenceId: null,
        direction: directions[atSide[1] as DirectionName],
        gapMeters: 0.3,
      })
      plan.assumptions.push({
        id: `edge-${index}`,
        message: '未指定台位净距，暂离舞台边界 0.3 米；台右按演员面向观众确定。',
      })
      continue
    }
    const directionId = `direction-${index}`
    const ambiguous = clause.match(/观众右|观众左|右边|左边|旁边|旁/)?.[0]
    if (ambiguous) {
      let choice = answer(directionId)
      if (ambiguous === '观众右') choice = '台左'
      else if (ambiguous === '观众左') choice = '台右'
      if (!choice || !['台左', '台右'].includes(choice)) {
        ask(directionId, `请明确“${ambiguous}”在舞台哪一侧。台右是演员面向观众时的右侧。`, [
          '台右',
          '台左',
        ])
        continue
      }
      clause = clause.replace(ambiguous, choice)
    }
    if (/舞台/.test(clause) && /(宽|深|×|x)/.test(clause)) {
      let rest = clause.replace(/^(?:建立|创建|新建|搭建|设置)?(?:一个)?/, '')
      const type: VenueProposal['type'] = /镜框式/.test(rest)
        ? 'proscenium'
        : /黑匣子/.test(rest)
          ? 'black-box'
          : /伸出式/.test(rest)
            ? 'thrust'
            : /教室/.test(rest)
              ? 'classroom'
              : (context.venue?.type ?? 'proscenium')
      const defaultType = !/(镜框式|黑匣子|伸出式|教室)/.test(rest) && !context.venue
      rest = rest.replace(/(?:镜框式|黑匣子|伸出式|教室)?舞台/, '').replace(/的/g, '')
      const values: Record<string, number | null> = {}
      const pair = rest.match(new RegExp(`^(${numberPattern})[×x](${numberPattern})(米|m)$`))
      if (pair) {
        values.宽 = parseStageNumber(pair[1]!)
        values.深 = parseStageNumber(pair[2]!)
        rest = ''
      } else {
        for (const key of ['宽', '深', '高']) {
          const match = rest.match(new RegExp(`${key}(?:度)?(${lengthPattern})`))
          if (match) {
            values[key] = parseStageLength(match[1]!)
            rest = rest.replace(match[0], '')
          }
        }
      }
      if (rest) return null
      for (const key of ['宽', '深']) {
        if (
          values[key] === undefined ||
          values[key] === null ||
          values[key]! < 0.01 ||
          values[key]! > 1000
        ) {
          const response = answer(`venue-${key}`)
          values[key] = response ? (parseStageLength(response) ?? parseStageNumber(response)) : null
        }
        if (values[key] === null || values[key]! < 0.01 || values[key]! > 1000)
          ask(`venue-${key}`, `请输入舞台${key === '宽' ? '宽度' : '深度'}，单位米。`)
      }
      if (values.高 !== undefined && (values.高 === null || values.高 < 0.01 || values.高 > 1000)) {
        ask('venue-高', '请输入有效的舞台高度，单位米。')
        continue
      }
      if (
        values.宽 !== null &&
        values.深 !== null &&
        values.宽! >= 0.01 &&
        values.宽! <= 1000 &&
        values.深! >= 0.01 &&
        values.深! <= 1000
      ) {
        plan.venue = {
          type,
          widthMeters: values.宽!,
          depthMeters: values.深!,
          heightMeters: values.高 ?? null,
        }
        if (defaultType)
          plan.assumptions.push({
            id: 'venue-type',
            message: '未指定舞台类型，预览暂采用镜框式舞台。',
          })
      }
      continue
    }
    let match = clause.match(
      new RegExp(
        `^(?:把)?(.+?)(?:向|往)?${directionPattern}(?:移动|挪动|移|挪)(${lengthPattern})$`,
      ),
    )
    if (match) {
      const target = select(match[1]!, `object-${index}`)
      const distance = parseStageLength(match[3]!)
      if (distance === null) {
        ask(`distance-${index}`, '请写明移动距离，例如半米或30厘米。')
        continue
      }
      if (target) {
        const p = upsert(target).transform.position
        const direction = match[2]!
        if (direction === '台右') p.x += distance
        else if (direction === '台左') p.x -= distance
        else if (direction === '台后') p.z += distance
        else p.z -= distance
      }
      continue
    }
    match = clause.match(new RegExp(`^(?:把)?(.+?)(?:旋转|转动|转)(${numberPattern})(?:度|°)$`))
    if (match) {
      const target = select(match[1]!, `object-${index}`)
      const degrees = parseStageNumber(match[2]!)
      if (degrees === null) ask(`rotation-${index}`, '请用明确角度，例如90度。')
      else if (target) upsert(target).transform.rotationDegrees.y += degrees
      continue
    }
    match = clause.match(
      new RegExp(
        `^复制(.+?)(?:放到|放在|移到|移至)(.+?)${directionPattern}((?:并)?(?:${lengthPattern}|紧贴|紧邻|相邻))?$`,
      ),
    )
    if (match) {
      const original = select(match[1]!, `object-${index}`)
      const reference = select(match[2]!, `reference-${index}`)
      const distance = gap(match[4] ?? '', `gap-${index}`)
      if (distance === null) return null
      if (original && reference) {
        const clone: StageItemProposal = {
          proposalId: `proposal-${plan.items.length + 1}`,
          existingNodeId: null,
          kind: original.kind,
          stepCount: original.stepCount,
          displayName: `${original.name}副本`,
          libraryAssetId: original.proposal?.libraryAssetId ?? null,
          dimensionsMeters: structuredClone(original.dimensionsMeters),
          transform: structuredClone(original.transform),
          certainty: 'stated',
          assumptionIds: [],
          evidenceIds: [],
        }
        plan.items.push(clone)
        relation(clone, reference, match[3] as DirectionName, distance)
      }
      continue
    }
    match = clause.match(/^(?:舞台中区|舞台中央|中区)(?:放置|摆放|放|摆|有)?(.+)$/)
    if (match) {
      const created = create(match[1]!)
      if (!created) return null
      plan.relations.push({
        id: `relation-${plan.relations.length + 1}`,
        subjectId: created.proposalId,
        referenceId: null,
        direction: 'center',
        gapMeters: 0,
      })
      continue
    }
    match =
      clause.match(
        new RegExp(
          `^(.+?)${directionPattern}(${lengthPattern}|紧邻|紧贴|相邻)?(?:放置|摆放|放|为|是|有)(.+)$`,
        ),
      ) ?? clause.match(new RegExp(`^(.+?)${directionPattern}(紧邻|紧贴|相邻)(.+)$`))
    if (match) {
      const reference = select(match[1]!, `reference-${index}`)
      const created = create(match[4]!)
      if (!created) return null
      const distance = gap(match[3] ?? '', `gap-${index}`)
      if (distance === null) return null
      if (reference) relation(created, reference, match[2] as DirectionName, distance)
      continue
    }
    match = clause.match(
      new RegExp(
        `^(?:把)?(.+?)(?:移到|移至|放到|放在|置于|在)(.+?)${directionPattern}((?:并)?(?:${lengthPattern}|紧贴|紧邻|相邻))?$`,
      ),
    )
    if (match) {
      const subject = select(match[1]!, `object-${index}`)
      const reference = select(match[2]!, `reference-${index}`)
      const distance = gap(match[4] ?? '', `gap-${index}`)
      if (distance === null) return null
      if (subject && reference)
        relation(upsert(subject), reference, match[3] as DirectionName, distance)
      continue
    }
    match = clause.match(/^(?:添加|放入|增加)(.+)$/)
    if (match) {
      const created = create(match[1]!)
      if (!created) return null
      plan.assumptions.push({
        id: `position-${index}`,
        message: '未指定台位，预览暂放在舞台中区。',
      })
      plan.relations.push({
        id: `relation-${plan.relations.length + 1}`,
        subjectId: created.proposalId,
        referenceId: null,
        direction: 'center',
        gapMeters: 0,
      })
      continue
    }
    return null
  }
  if (
    !plan.venue &&
    !context.venue &&
    !plan.questions.some((question) => question.id.startsWith('venue-'))
  ) {
    ask('venue-宽', '请输入舞台宽度，单位米。')
    ask('venue-深', '请输入舞台深度，单位米。')
    const width = answer('venue-宽'),
      depth = answer('venue-深')
    const widthMeters = width ? (parseStageLength(width) ?? parseStageNumber(width)) : null
    const depthMeters = depth ? (parseStageLength(depth) ?? parseStageNumber(depth)) : null
    if (
      widthMeters !== null &&
      depthMeters !== null &&
      widthMeters >= 0.01 &&
      widthMeters <= 1000 &&
      depthMeters >= 0.01 &&
      depthMeters <= 1000
    ) {
      plan.venue = { type: 'proscenium', widthMeters, depthMeters, heightMeters: null }
      plan.questions = plan.questions.filter((question) => !question.id.startsWith('venue-'))
    }
  }
  return resolveStagePlan(StagePlanSchema.parse(plan), context)
}
