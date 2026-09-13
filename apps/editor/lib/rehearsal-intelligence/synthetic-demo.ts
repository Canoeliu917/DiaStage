import type { AnyNode, SceneGraph } from '@pascal-app/core'
import { z } from 'zod'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { THEATRE_METADATA_KEY } from '../theatre/scene-adapter'
import { StageSceneDocumentSchema } from '../theatre/simulation'
import { proposalActionSignature } from './conversation'
import { ACTIVE_DIMENSIONS, ONTOLOGY_VERSION, PROMPT_VERSION } from './dimensions'
import { compileProposal } from './proposal-compiler'
import { validateContext } from './proposal-validator'
import { AgentOutputSchema, type RehearsalContext, type Suggestion } from './schema'

export { readSyntheticDemoIntention, syntheticDemoIntentionKey } from './synthetic-demo-intention'

export const SYNTHETIC_DEMO_NAME = '告别 · 原创演示'
export const SYNTHETIC_DEMO_SCRIPT = '两个人在告别。A想走。B不想让他走。'
export const SYNTHETIC_DEMO_LABEL = '演示数据 · 非真实模型输出'
export const SYNTHETIC_DEMO_MODEL_VERSION = 'synthetic-conversation-demo-not-real-model-v1'
export const SYNTHETIC_DEMO_METADATA_KEY = 'diastageSyntheticDemo'
const DemoMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  provenance: z.literal('synthetic'),
  originalContent: z.literal(true),
  script: z.literal(SYNTHETIC_DEMO_SCRIPT),
  privateProjectData: z.literal(true),
  trainingAuthorized: z.literal(false),
  trainingEligible: z.literal(false),
  rightsStatus: z.literal('cleared'),
})

export function createSyntheticDemoScene(): SceneGraph {
  const graph = createTheatreSceneGraph(SYNTHETIC_DEMO_NAME)
  const site = graph.nodes[graph.rootNodeIds[0]!]!
  const document = StageSceneDocumentSchema.parse(site.metadata[THEATRE_METADATA_KEY])
  document.rehearsalSimulation.performers = [
    {
      id: crypto.randomUUID(),
      name: 'A',
      color: '#555555',
      position: [-0.6, 0, 0],
      facing: Math.PI / 2,
      visible: true,
    },
    {
      id: crypto.randomUUID(),
      name: 'B',
      color: '#999999',
      position: [0.6, 0, 0],
      facing: -Math.PI / 2,
      visible: true,
    },
  ]
  site.metadata[THEATRE_METADATA_KEY] = document
  site.metadata[SYNTHETIC_DEMO_METADATA_KEY] = DemoMetadataSchema.parse({
    schemaVersion: 1,
    provenance: 'synthetic',
    originalContent: true,
    script: SYNTHETIC_DEMO_SCRIPT,
    privateProjectData: true,
    trainingAuthorized: false,
    trainingEligible: false,
    rightsStatus: 'cleared',
  })
  return graph
}

export function isSyntheticDemoScene(nodes: Record<string, AnyNode>): boolean {
  return Object.values(nodes).some(
    (node) =>
      node.type === 'site' &&
      DemoMetadataSchema.safeParse(node.metadata[SYNTHETIC_DEMO_METADATA_KEY]).success,
  )
}

type ProposalContent = z.infer<typeof AgentOutputSchema>['proposals'][number]

/** Deterministic demonstration rules; this function never calls a model or changes a scene. */
export function syntheticConversationOutput(
  rawContext: RehearsalContext,
  direction = 0,
): z.infer<typeof AgentOutputSchema> {
  const context = validateContext(rawContext)
  const visible = context.performers.filter((performer) => performer.visible)
  const a = visible.find((performer) => performer.name === 'A') ?? visible[0]
  const b =
    visible.find((performer) => performer.name === 'B' && performer.id !== a?.id) ??
    visible.find((performer) => performer.id !== a?.id)
  if (!a || !b) throw new Error('请在演示舞台保留至少两位可见人物，再一起试排。')
  const distance = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2])
  const position = (performer: typeof a) =>
    `（${performer.position[0].toFixed(1)}, ${performer.position[2].toFixed(1)} 米）`
  const facts = `现在${a.name}在${position(a)}，${b.name}在${position(b)}，相距${distance.toFixed(2)}米。`
  const conversation = context.conversation
  const held = new Set(conversation?.heldPerformerIds ?? [])
  const hold = (performerId: string): Suggestion => ({
    id: `demo-${performerId}`,
    performerId,
    intention: '保留现在的位置，让回应留在停顿里。',
    movement: 'hold',
    targetPerformerId: null,
    zone: null,
    extent: 'small',
    pace: 'slow',
  })
  const suggestion = (
    performerId: string,
    movement: Suggestion['movement'],
    zone: Suggestion['zone'] = null,
  ): Suggestion => ({
    ...hold(performerId),
    movement,
    zone,
    targetPerformerId: movement === 'withdraw' ? (performerId === a.id ? b.id : a.id) : null,
    intention:
      movement === 'withdraw'
        ? '可以试试拉开一点距离。'
        : movement === 'toward-zone'
          ? '可以试试换一个空间方向回应。'
          : '也可以保持现在的处理。',
  })
  const constrain = (suggestions: Suggestion[]) => {
    const result = suggestions.map((item) =>
      held.has(item.performerId) ? hold(item.performerId) : structuredClone(item),
    )
    for (const id of held)
      if (!result.some((item) => item.performerId === id)) result.push(hold(id))
    return result
  }
  const compile = (proposal: ProposalContent) =>
    compileProposal(context, {
      ...proposal,
      proposalId: 'synthetic-preview-validation',
      activeDimensions: [...ACTIVE_DIMENSIONS],
      modelVersion: SYNTHETIC_DEMO_MODEL_VERSION,
      ontologyVersion: ONTOLOGY_VERSION,
      promptVersion: PROMPT_VERSION,
    })
  const parent = conversation?.previousInteraction?.proposals.find(
    (proposal) => proposal.proposalId === conversation.selectedProposalId,
  )
  if (parent && held.size) {
    const names = visible
      .filter((performer) => held.has(performer.id))
      .map((performer) => performer.name)
      .join('、')
    const proposal: ProposalContent = {
      title: `${parent.title.slice(0, 90)} · 继续试`,
      intention: context.intention.slice(0, 600),
      rationale: `${facts}按你的想法让${names}保持当前位置，其余动作保留所选方向；可以先看预演，再决定是否成立。`,
      suggestions: constrain(parent.suggestions),
      alternatives: ['也可以保持现在的排演。'],
      evidence: [{ source: 'intention', quote: context.intention.slice(0, 600) }],
      confidence: 0.5,
    }
    compile(proposal)
    return AgentOutputSchema.parse({ dramaticState: [], proposals: [proposal] })
  }
  const candidates: ProposalContent[] = [
    {
      title: '让离开先发生',
      intention: `让${a.name}试着退开，${b.name}暂时留在原地。`,
      rationale: `${facts}${distance < 2 ? '两人已经很近，可以先用一点退开显出告别。' : '两人已经有一段距离，可以让退开更明确，也可以不再拉远。'}这只是一个可试的方向。`,
      suggestions: [suggestion(a.id, 'withdraw'), hold(b.id)],
    },
    {
      title: '把回应放到不同方向',
      intention: `${a.name}向台后，${b.name}向台口，试试错开的回应。`,
      rationale: `${facts}可以不急着沿两人之间的直线拉开，而让各自的空间方向显出犹豫；你也可以让其中一人不动。`,
      suggestions: [
        suggestion(a.id, 'toward-zone', 'upstage'),
        suggestion(b.id, 'toward-zone', 'downstage'),
      ],
    },
    {
      title: '让停顿承担告别',
      intention: '两个人都保持当前位置，先试一次没有位移的回应。',
      rationale: `${facts}现有距离本身已经是一种关系。可以先保持站位，把变化交给停顿，再决定要不要移动。`,
      suggestions: [hold(a.id), hold(b.id)],
    },
    {
      title: '让挽留的人先退一步',
      intention: `${a.name}留下，换成${b.name}试着退开。`,
      rationale: `${facts}也可以把退开的行动交给${b.name}，试试想挽留的人先腾出空间时，这段告别会怎样变化。`,
      suggestions: [hold(a.id), suggestion(b.id, 'withdraw')],
    },
    {
      title: '把离开放到横向',
      intention: `${a.name}向台右侧移动，${b.name}保留站位。`,
      rationale: `${facts}可以试试横向离开，让距离变化暂时让位给方向变化。是否更克制，留给你在舞台上判断。`,
      suggestions: [suggestion(a.id, 'toward-zone', 'stage-right'), hold(b.id)],
    },
    {
      title: '从另一边回应',
      intention: `${a.name}保留站位，${b.name}向台左侧尝试一步。`,
      rationale: `${facts}也可以让${b.name}从另一侧回应，让${a.name}暂时不动；如果这不成立，可以继续手动排演。`,
      suggestions: [hold(a.id), suggestion(b.id, 'toward-zone', 'stage-left')],
    },
  ].map((proposal) => ({
    ...proposal,
    suggestions: constrain(proposal.suggestions),
    alternatives: ['也可以保持现在的排演，由你决定。'],
    evidence: [{ source: 'intention' as const, quote: context.intention.slice(0, 600) }],
    confidence: 0.5,
  }))
  const rejected = new Set(conversation?.rejectedProposalSignatures ?? [])
  const proposals: ProposalContent[] = []
  const start = Math.abs(Math.trunc(direction)) % candidates.length
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[(index + start) % candidates.length]!
    const signature = proposalActionSignature(candidate)
    if (
      rejected.has(signature) ||
      proposals.some((proposal) => proposalActionSignature(proposal) === signature)
    )
      continue
    try {
      compile(candidate)
    } catch {
      continue
    }
    proposals.push(candidate)
    if (proposals.length === 2) break
  }
  if (!proposals.length)
    throw new Error('当前站位没有新的安全演示方向。可以先手动调整人物，再告诉 Dia 想试什么。')
  return AgentOutputSchema.parse({ dramaticState: [], proposals })
}
