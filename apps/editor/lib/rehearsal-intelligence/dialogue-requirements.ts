import type { SceneContextSummary, StagePlan } from '@pascal-app/core/stage'
import type { DialogueStageAction } from './dialogue-stage-actions'
import type { OpenLanguageContext } from './open-language'

export type DialogueRequirements = {
  wall: DialogueStageAction['wall']
  wallRegion: DialogueStageAction['region']
  groupObjectIds: string[] | null
  preservePath: boolean
  clarification: string | null
}

export function extractDialogueRequirements(
  rawUtterance: string,
  context: {
    planning: SceneContextSummary
    pendingPlan: StagePlan | null
    openContext: Pick<OpenLanguageContext, 'lastReferencedIds'>
  },
): DialogueRequirements {
  const result: DialogueRequirements = {
    wall: null,
    wallRegion: null,
    groupObjectIds: null,
    preservePath: false,
    clarification: null,
  }
  const clauses = rawUtterance
    .normalize('NFKC')
    .replace(/\s/g, '')
    .split(/[，,。；;！？!?]|但是|不过|而是|但/)
    .filter(
      (clause) =>
        !/什么意思|什么叫|为什么|为何|区别|解释|定义|含义|如何|怎么|怎样|多少/.test(clause),
    )
  const wallClauses = clauses.filter(
    (clause) =>
      /(?:靠|贴).{0,12}墙/.test(clause) &&
      !/(?:不要|不用|不需要|别|不必|无需|避免|不).{0,8}(?:靠|贴).{0,12}墙/.test(clause),
  )
  if (wallClauses.length) {
    const location = clauses
      .filter((clause) => !/(?:不要|不用|不需要|别|无需|不).*(?:靠|贴)/.test(clause))
      .join('，')
    const sides = [
      ...location.matchAll(
        /(观众(?:视角|的)?|演员(?:视角|的)?|舞台|台)?([左右])(?:边|侧)?(?:的)?([前后])?/g,
      ),
    ]
    const side = sides.at(-1)
    const frame = side?.[1] ?? [...sides].reverse().find((entry) => entry[1])?.[1]
    const actorFrame = frame === '台' || frame?.startsWith('演员')
    const horizontal = side ? ((side[2] === '左') !== !!actorFrame ? 'left' : 'right') : 'center'
    const depth = /后(?:区|方|面|边|侧|墙)|[左右中]后|台后/.test(location)
      ? 'rear'
      : /前(?:区|方|面|边|侧|墙)|[左右中]前|台前|台口/.test(location)
        ? 'front'
        : 'middle'
    const wallWords = wallClauses.map((clause) => clause.match(/(?:靠|贴).{0,12}?墙/)![0])
    const walls = wallWords.map((word) =>
      /后/.test(word)
        ? 'back'
        : /前/.test(word)
          ? 'front'
          : /左|右/.test(word)
            ? word.includes('左') !== !!actorFrame
              ? 'left'
              : 'right'
            : depth === 'rear'
              ? 'back'
              : depth === 'front'
                ? 'front'
                : horizontal !== 'center'
                  ? horizontal
                  : null,
    )
    const unique = new Set(walls)
    if (unique.size !== 1 || walls[0] === null || walls[0] === 'front') {
      result.clarification = '要靠哪面现有墙片？请说明后墙、观众左墙或观众右墙。'
    } else {
      result.wall = walls[0] as NonNullable<DialogueStageAction['wall']>
      const horizontalExplicit = !!side || /中间|中央|正中|中[前后]|[前后]中/.test(location)
      const depthExplicit = depth !== 'middle' || /中区|左中|右中|中部/.test(location)
      result.wallRegion =
        horizontalExplicit && depthExplicit
          ? depth === 'middle' && horizontal === 'center'
            ? 'center'
            : (`${depth}-${horizontal}` as DialogueStageAction['region'])
          : null
    }
  }
  result.preservePath = clauses.some(
    (clause) =>
      /通道|过道|走道|通路/.test(clause) &&
      /留|避开|畅通|不.{0,4}(?:挡|堵|占)|别.{0,4}(?:挡|堵|占)/.test(clause) &&
      !/(?:不需要|不用|无需|不必)(?:再|特意)?(?:留|保留|预留|考虑)?(?:出)?.{0,6}(?:通道|过道|走道|通路)|(?:不要|别)(?:留|保留|预留)(?:出)?.{0,6}(?:通道|过道|走道|通路)/.test(
        clause,
      ),
  )
  const group = clauses.some(
    (clause) =>
      /整组|整套|全组|一起/.test(clause) &&
      /移|挪|搬|向|往|调整/.test(clause) &&
      !/(?:不要|不用|不需要|别|无需).{0,4}(?:整组|整套|全组|一起)|(?:整组|整套|全组|一起).{0,4}(?:不要|不用|不需要|别|无需)(?:移|挪|搬|动|调整)/.test(
        clause,
      ),
  )
  if (group) {
    const ids = context.pendingPlan
      ? context.pendingPlan.items.map((item) => item.existingNodeId ?? item.proposalId)
      : context.planning.selectedObjectIds.length > 1
        ? context.planning.selectedObjectIds
        : context.openContext.lastReferencedIds.length > 1
          ? context.openContext.lastReferencedIds
          : []
    if (
      ids.length < 2 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => context.planning.objects.filter((object) => object.id === id).length !== 1)
    )
      result.clarification ??= '整组指哪些物件？请先选中这一组。'
    else result.groupObjectIds = [...ids]
  }
  return result
}
