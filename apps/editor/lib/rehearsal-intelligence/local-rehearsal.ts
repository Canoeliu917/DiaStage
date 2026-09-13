import type { z } from 'zod'
import { discussionDirection } from './dia-backbone'
import { validateContext } from './proposal-validator'
import { AgentOutputSchema, type RehearsalContext, type Suggestion } from './schema'

export const LOCAL_REHEARSAL_MODEL_VERSION = 'local-object-rehearsal-rules-v1'

/** Controlled initial blocking, compiled against the current scene only after validation. */
export function localRehearsalOutput(
  raw: RehearsalContext,
): z.infer<typeof AgentOutputSchema> | null {
  const direction = discussionDirection(
    raw.intention,
    raw.conversation?.recentMessages ?? [],
    raw.sceneVersion ?? '',
  )
  if (direction) {
    const context = validateContext(raw)
    const people = context.performers.filter((person) => person.visible)
    if (people.length !== 2) throw new Error('请先明确本次讨论涉及的两位人物，再试这个方向。')
    const [a, b] = people
    return AgentOutputSchema.parse({
      dramaticState: [],
      proposals: [
        {
          title: direction === 1 ? '先试一次靠近' : '先给两人留出距离',
          intention: context.intention,
          rationale: `本机规则只把刚才选择的方向转成预演：${a!.name}${direction === 1 ? `保持原位，${b!.name}尝试靠近` : `与${b!.name}分别尝试退开`}。位移仍由现有排演编译器计算并检查边界与冲突，不判断戏剧效果是否成立。`,
          suggestions: people.map((person, index) => ({
            id: person.id,
            performerId: person.id,
            intention:
              direction === 1 && index === 0
                ? '保持位置'
                : direction === 1
                  ? '试着靠近'
                  : '试着拉开距离',
            movement: direction === 1 ? (index === 0 ? 'hold' : 'approach') : 'withdraw',
            targetPerformerId: direction === 1 && index === 0 ? null : people[1 - index]!.id,
            zone: null,
            extent: 'small',
            pace: 'natural',
          })),
          alternatives: ['也可以保留现在的处理。'],
          evidence: [{ source: 'intention', quote: context.intention }],
          confidence: 1,
        },
      ],
    })
  }
  const clauses = raw.intention
    .split(/[,，;；。\n]+/u)
    .map((clause) => clause.trim())
    .filter(Boolean)
  const relative = clauses.map((clause) => {
    const hold = clause.match(/^(?:请)?(?:让)?(.+?)(?:别动|不要动|保持原位|保持位置)$/u)
    if (hold) return { name: hold[1]!.trim(), movement: 'hold' as const, target: '' }
    const withdraw = clause.match(/^(.+?)离(.+?)远一点$/u)
    if (withdraw)
      return {
        name: withdraw[1]!.trim(),
        movement: 'withdraw' as const,
        target: withdraw[2]!.trim(),
      }
    const approach = clause.match(/^(?:只让|让)?(.+?)靠近(?:一点)?(.*)$/u)
    return approach
      ? { name: approach[1]!.trim(), movement: 'approach' as const, target: approach[2]!.trim() }
      : null
  })
  if (relative.every((entry) => entry !== null)) {
    const context = validateContext(raw)
    const person = (name: string) => {
      const matches = context.performers.filter(
        (entry) =>
          entry.visible &&
          [entry.id, entry.name].some((value) => value.toLowerCase() === name.toLowerCase()),
      )
      if (matches.length !== 1)
        throw new Error(`无法唯一确定人物「${name}」，请明确当前舞台中的人物。`)
      return matches[0]!
    }
    const held = relative
      .filter((entry) => entry.movement === 'hold')
      .map((entry) => person(entry.name))
    const suggestions: Suggestion[] = relative.map((entry) => {
      const actor = person(entry.name)
      const target =
        entry.movement === 'hold'
          ? null
          : entry.target
            ? person(entry.target)
            : held.length === 1
              ? held[0]!
              : null
      if (entry.movement !== 'hold' && (!target || target.id === actor.id))
        throw new Error('请说明要靠近或远离哪位人物。')
      if (entry.movement !== 'hold' && held.some((fixed) => fixed.id === actor.id))
        throw new Error('同一人物同时被要求保持原位和移动，请先明确。')
      return {
        id: actor.id,
        performerId: actor.id,
        intention: entry.movement === 'hold' ? '保持位置' : '试一次小幅距离调整',
        movement: entry.movement,
        targetPerformerId: target?.id ?? null,
        zone: null,
        extent: 'small',
        pace: 'natural',
      }
    })
    return AgentOutputSchema.parse({
      dramaticState: [],
      proposals: [
        {
          title: '先试一次人物距离调整',
          intention: context.intention,
          rationale: '按明确的人物关系预览小幅移动；保持原位的人物不移动，采用前由你确认。',
          suggestions,
          alternatives: ['也可以保留当前站位。'],
          evidence: [{ source: 'intention', quote: context.intention }],
          confidence: 1,
        },
      ],
    })
  }
  const parsed = clauses.map((clause) => {
    const stand = clause.match(/^(?:请)?(?:让)?(.+?)\s*(?:站在?|靠着?)\s*(.+)$/u)
    const further = clause.match(/^(.+?)\s*(?:别|不要)(?:那么|这么|太)?近(?:了)?$/u)
    return stand
      ? { name: stand[1]!.trim(), target: stand[2]!.trim(), revision: false }
      : further
        ? { name: further[1]!.trim(), target: '', revision: true }
        : null
  })
  if (parsed.every((entry) => entry === null)) {
    if (
      /(?:绕过|走到|走向|跑到|穿过)/u.test(raw.intention) &&
      raw.obstacles.some(
        (object) =>
          raw.intention.includes(object.name) ||
          (/门|door/i.test(object.name) && raw.intention.includes('门')) ||
          (/桌|table/i.test(object.name) && raw.intention.includes('桌')),
      )
    )
      throw new Error('本轮只预览初始站位，不自动绕障；请用走位工具记录实际路线。')
    return null
  }
  if (parsed.some((entry) => entry === null))
    throw new Error('本轮可先指定人物站在某件布景旁；其余行动请分开说明，不会跳过未理解的部分。')
  const context = validateContext(raw)
  const previous = context.conversation?.previousInteraction?.proposals.find(
    (proposal) => proposal.proposalId === context.conversation?.selectedProposalId,
  )
  const revising = parsed.some((entry) => entry?.revision)
  if (revising && !previous) throw new Error('请先选中人物靠近哪件布景的上一轮方案，再调整距离。')
  if (
    revising &&
    previous?.suggestions.some((s) => s.movement !== 'stand-near-object' && s.movement !== 'hold')
  )
    throw new Error('上一轮还包含移动路线，请明确本轮人物与布景的站位，避免重复旧行动。')
  const suggestions: Suggestion[] = revising ? structuredClone(previous!.suggestions) : []
  const mentioned = new Set<string>()
  for (const entry of parsed) {
    if (!entry) continue
    const people = context.performers.filter(
      (person) =>
        person.visible &&
        [person.name, person.id].some((name) => name.toLowerCase() === entry.name.toLowerCase()),
    )
    if (people.length !== 1)
      throw new Error(`无法唯一确定人物「${entry.name}」，请使用当前舞台中的人物名称或编号。`)
    const performer = people[0]!
    if (mentioned.has(performer.id))
      throw new Error('同一人物本轮只能指定一个初始站位，请分开不同时间的行动。')
    mentioned.add(performer.id)
    const prior = previous?.suggestions.find((s) => s.performerId === performer.id)
    let targetId: string
    if (entry.revision) {
      if (prior?.movement !== 'stand-near-object' || !prior.targetObjectId)
        throw new Error(`上一轮没有「${performer.name}」对应的布景目标，请说明想离哪件物件远一些。`)
      if (prior.extent === 'medium')
        throw new Error('当前建议已保留 1 米净距；更远的具体站位请手动调整。')
      if (!context.obstacles.some((object) => object.id === prior.targetObjectId))
        throw new Error('上一轮的布景目标已不在当前场景，请重新指定。')
      targetId = prior.targetObjectId
    } else {
      if (/^(?:近|到)|然后|接着|绕过|走到|走向|跑到|穿过/u.test(entry.target))
        throw new Error('本轮只预览初始站位，不自动绕障或生成多段行动；请用走位工具记录实际路线。')
      const name = entry.target.replace(/(?:的)?(?:旁边|附近|旁|边)$/u, '').trim()
      let objects = context.obstacles.filter((object) => object.id === name || object.name === name)
      if (!objects.length) {
        const alias = /^(?:门|门口)$/u.test(name)
          ? /门|door/i
          : /^(?:桌|桌子|圆桌)$/u.test(name)
            ? /桌|table/i
            : null
        if (alias) objects = context.obstacles.filter((object) => alias.test(object.name))
      }
      if (objects.length !== 1)
        throw new Error(
          `无法唯一确定「${name}」，请给出当前布景的完整名称；目标缺失或同名时不会猜位置。`,
        )
      targetId = objects[0]!.id
    }
    const suggestion: Suggestion = {
      id: performer.id,
      performerId: performer.id,
      intention: `可以试试调整「${performer.name}」的初始站位，保留人与布景的距离。`,
      movement: 'stand-near-object',
      targetObjectId: targetId,
      targetPerformerId: null,
      zone: null,
      extent: entry.revision ? 'medium' : 'small',
      pace: 'natural',
    }
    const index = suggestions.findIndex((s) => s.performerId === performer.id)
    if (index < 0) suggestions.push(suggestion)
    else suggestions[index] = suggestion
  }
  if (context.conversation?.heldPerformerIds.some((id) => mentioned.has(id)))
    throw new Error('同一人物同时被要求保持原位和改变站位，请先明确本轮意图。')
  return AgentOutputSchema.parse({
    dramaticState: [],
    proposals: [
      {
        title: revising ? '给人与物件留出距离' : '先试人与物件的站位',
        intention: context.intention.slice(0, 600),
        rationale:
          '假设人物占地半径 0.25 米，初次站位与布景外轮廓净距 0.5 米；“别那么近”改为 1 米。取当前人物所在位置最近的一侧，越界或冲突时拒绝。只改变预演初始站位并清除该人物旧路线，不代表已走到，也不改变朝向；是否采用由你决定。',
        suggestions,
        alternatives: ['需要绕过布景、先后行动或更精确的站位时，可以用人物与行动面板手动调整。'],
        evidence: [{ source: 'intention', quote: context.intention.slice(0, 600) }],
        confidence: 1,
      },
    ],
  })
}
