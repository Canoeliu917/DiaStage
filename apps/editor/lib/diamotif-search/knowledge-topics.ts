import { z } from 'zod'
import topicResources from '../../../../DiaMotif/knowledge/search-knowledge-topics.json'

export const KNOWLEDGE_TOPICS = [
  { id: 'all', label: '全部知识', description: '全部已登记戏剧专业知识' },
  {
    id: 'performance',
    label: '表演',
    description: '人物塑造、行动、体验、形体与表演训练',
  },
  {
    id: 'directing',
    label: '导演',
    description: '剧本分析、舞台调度、构图、节奏与观演关系',
  },
  {
    id: 'voice',
    label: '台词与声乐',
    description: '台词表达、重音停顿、气息、发声与共鸣',
  },
  {
    id: 'dramaturgy',
    label: '剧作与构作',
    description: '人物、情境、冲突、情节、结构与剧本改编',
  },
  {
    id: 'stage-design',
    label: '舞台美术',
    description: '布景、道具、幕布、舞台空间与视觉构成',
  },
  {
    id: 'production',
    label: '制作与管理',
    description: '布景制作、排练合成、换景、舞台监督与剧场运行',
  },
  {
    id: 'history-theory',
    label: '戏剧史论',
    description: '戏剧发展、表演流派与理论概念；史实和观点分别注明出处',
  },
] as const

export type KnowledgeTopic = (typeof KNOWLEDGE_TOPICS)[number]['id']
export const KnowledgeTopicSchema = z.enum(KNOWLEDGE_TOPICS.map(({ id }) => id))
export const KNOWLEDGE_TOPIC_RESOURCES: Readonly<
  Record<Exclude<KnowledgeTopic, 'all'>, readonly string[]>
> = topicResources

export function knowledgeTopicMatches(resourceId: string, topic: KnowledgeTopic): boolean {
  return topic === 'all' || KNOWLEDGE_TOPIC_RESOURCES[topic].includes(resourceId)
}
