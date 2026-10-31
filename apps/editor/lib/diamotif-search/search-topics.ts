import { z } from 'zod'
import resourceTopics from '../../../../DiaMotif/knowledge/search-resource-topics.json'
import type { SearchCategory, SearchResource } from './catalog'
import { KNOWLEDGE_TOPICS, type KnowledgeTopic, knowledgeTopicMatches } from './knowledge-topics'

export const SEARCH_TOPICS = [
  {
    id: 'script-full',
    category: 'scripts',
    label: '完整剧本',
    description: '可核实完整范围的剧本文本；目录或剧情简介不作全文',
  },
  {
    id: 'script-translation',
    category: 'scripts',
    label: '译本',
    description: '注明译者、语言及版本的剧本译本；国外原站暂缓',
  },
  {
    id: 'script-adaptation',
    category: 'scripts',
    label: '改编本',
    description: '明确原作及改编关系的剧本文本；制作介绍不代替改编剧本',
  },
  {
    id: 'script-play',
    category: 'scripts',
    label: '话剧剧本',
    description: '经完整性审核的话剧原本与译本；不以目录或选段代替完整剧本',
  },
  {
    id: 'script-opera',
    category: 'scripts',
    label: '戏曲与歌剧',
    description: '戏曲剧本与歌剧脚本；注明剧种、改编及文本版本',
  },
  {
    id: 'script-musical',
    category: 'scripts',
    label: '音乐剧剧本',
    description: '音乐剧脚本、唱词与可核查文本来源',
  },
  {
    id: 'script-children',
    category: 'scripts',
    label: '儿童戏剧',
    description: '经完整性审核的儿童戏剧文本；不收选段、课程招生或活动介绍',
  },
  ...KNOWLEDGE_TOPICS.filter(({ id }) => id !== 'all').map((topic) => ({
    ...topic,
    category: 'knowledge' as const,
  })),
  {
    id: 'video-full',
    category: 'videos',
    label: '完整演出',
    description: '可核实为完整版本的舞台录像；分集缺失或选段不作全剧',
  },
  {
    id: 'person-actor',
    category: 'people',
    label: '戏剧演员',
    description: '有舞台作品、角色或戏剧表演经历可核实的演员及演员目录',
  },
  {
    id: 'person-director-writer',
    category: 'people',
    label: '导演与编剧',
    description: '有戏剧作品或创作教学经历可核实的导演、编剧与构作人员',
  },
  {
    id: 'person-design-tech',
    category: 'people',
    label: '舞美与技术',
    description: '戏剧舞美、服装、灯光、声音及舞台技术创作者',
  },
  {
    id: 'person-production',
    category: 'people',
    label: '制作与管理',
    description: '戏剧制作、舞台监督及演出管理人员的专业履历',
  },
  {
    id: 'person-composer-choreographer',
    category: 'people',
    label: '作曲与编舞',
    description: '有戏剧、歌剧、音乐剧或舞剧作品可核实的作曲、编舞创作者',
  },
  {
    id: 'person-voice-coach',
    category: 'people',
    label: '台词声乐指导',
    description: '与戏剧作品或专业训练相关的台词、声乐与声音指导人员',
  },
  {
    id: 'venue-state',
    category: 'venues',
    label: '国有院团',
    description: '有明确机构性质依据的国有剧院与院团；不凭资助关系判断所有制',
  },
  {
    id: 'venue-independent',
    category: 'venues',
    label: '独立剧团',
    description: '有明确介绍及作品记录的独立剧团；不凭规模判断性质',
  },
  {
    id: 'venue-space',
    category: 'venues',
    label: '剧场空间',
    description: '剧场、排练空间、舞台形式与场馆设施资料',
  },
  {
    id: 'venue-organization',
    category: 'venues',
    label: '剧团与机构',
    description: '剧团及戏剧制作机构的背景、业务与可核实作品',
  },
  {
    id: 'venue-campus',
    category: 'venues',
    label: '校园剧场',
    description: '院校剧场、校园戏剧团体及其明确的演出空间资料',
  },
  {
    id: 'venue-community',
    category: 'venues',
    label: '社区剧场',
    description: '社区戏剧团体与社区演出空间；不按规模推断机构性质',
  },
  {
    id: 'venue-new-space',
    category: 'venues',
    label: '演艺新空间',
    description: '具有明确戏剧演出用途的新型空间、非传统剧场与环境式场地',
  },
  {
    id: 'event-play',
    category: 'events',
    label: '话剧演出',
    description: '话剧版本、场次及官方票讯；目录与具体场次分开',
  },
  {
    id: 'event-opera-dance',
    category: 'events',
    label: '戏曲歌剧舞剧',
    description: '戏曲、歌剧与舞剧的排期及官方票讯',
  },
  {
    id: 'event-musical',
    category: 'events',
    label: '音乐剧演出',
    description: '音乐剧的制作版本、巡演排期与官方票讯',
  },
  {
    id: 'event-immersive',
    category: 'events',
    label: '沉浸式演出',
    description: '沉浸式、环境式及相关实验戏剧的实际演出安排',
  },
  {
    id: 'event-children',
    category: 'events',
    label: '儿童戏剧',
    description: '儿童及家庭观众相关戏剧的具体排期与票讯',
  },
  {
    id: 'admission-undergraduate',
    category: 'admissions',
    label: '本科与专科',
    description: '戏剧相关本科、专科与基础文凭项目的招生简章及要求',
  },
  {
    id: 'admission-postgraduate',
    category: 'admissions',
    label: '研究生',
    description: '戏剧相关硕士、博士项目的招生及申请要求',
  },
  {
    id: 'admission-hk-macao',
    category: 'admissions',
    label: '港澳院校',
    description: '香港及澳门院校戏剧相关专业的入学申请资料',
  },
  {
    id: 'opportunity-casting',
    category: 'opportunities',
    label: '演员选角',
    description: '有发布主体、角色要求和有效状态的舞台演员选角与试镜',
  },
  {
    id: 'opportunity-crew',
    category: 'opportunities',
    label: '剧组招募',
    description: '戏剧制作团队的剧组招募，注明工作内容与合作条件',
  },
  {
    id: 'opportunity-design-tech',
    category: 'opportunities',
    label: '舞美技术',
    description: '布景、服装、灯光、声音及舞台技术岗位',
  },
  {
    id: 'opportunity-production',
    category: 'opportunities',
    label: '制作管理',
    description: '戏剧制作、舞台监督、运营与演出管理岗位',
  },
  {
    id: 'opportunity-intern',
    category: 'opportunities',
    label: '实习机会',
    description: '戏剧机构及演出项目明确发布的实习岗位',
  },
  {
    id: 'opportunity-collaboration',
    category: 'opportunities',
    label: '创作合作',
    description: '有具体项目、发布主体及合作条件的戏剧创作合作邀请',
  },
  {
    id: 'opportunity-volunteer',
    category: 'opportunities',
    label: '志愿服务',
    description: '戏剧演出、剧院或节展明确发布的志愿服务招募及工作条件',
  },
  {
    id: 'exam-unified',
    category: 'arts-exams',
    label: '统考与联考',
    description: '戏剧相关省级统考与戏曲联考的范围、说明和安排',
  },
  {
    id: 'exam-school',
    category: 'arts-exams',
    label: '校考安排',
    description: '戏剧院校专业校考安排与统考衔接；院校招生简章另分',
  },
  {
    id: 'exam-registration-results',
    category: 'arts-exams',
    label: '报名与成绩',
    description: '戏剧艺考报名、准考证、成绩查询及相应公告',
  },
  {
    id: 'exam-policy',
    category: 'arts-exams',
    label: '考试政策',
    description: '戏剧相关艺考政策，保留适用地区、年份和公告阶段',
  },
  {
    id: 'festival',
    category: 'festivals',
    label: '戏剧节展',
    description: '戏剧节届次、展演单元及节目总览；单场售票另分',
  },
  {
    id: 'workshop',
    category: 'festivals',
    label: '专业工作坊',
    description: '戏剧专业创作工作坊、讲座与交流活动',
  },
  {
    id: 'festival-open-call',
    category: 'festivals',
    label: '项目征集',
    description: '节展作品征集及创作项目报名，注明届次和有效状态',
  },
  {
    id: 'festival-residency',
    category: 'festivals',
    label: '驻留计划',
    description: '戏剧创作者驻留项目、创作支持与申请要求',
  },
  {
    id: 'festival-incubation',
    category: 'festivals',
    label: '创作孵化',
    description: '戏剧新作开发、项目孵化及创作实验计划',
  },
  {
    id: 'festival-reading',
    category: 'festivals',
    label: '剧本朗读',
    description: '读剧、剧本围读及公开朗读交流活动；不代表已有完整演出制作',
  },
  {
    id: 'festival-forum',
    category: 'festivals',
    label: '论坛与讲座',
    description: '戏剧专业论坛、讲座、创作者对谈与行业交流活动',
  },
  {
    id: 'festival-funding',
    category: 'festivals',
    label: '资助计划',
    description: '戏剧创作、演出或研究资助的发布文件及申请条件',
  },
  {
    id: 'festival-award',
    category: 'festivals',
    label: '奖项评选',
    description: '戏剧专业奖项、评选规则、届次及官方结果公告',
  },
  {
    id: 'ai-film',
    category: 'ai-screen',
    label: 'AI电影',
    description: '明确涉及AI生成或辅助制作的电影作品与实践',
  },
  {
    id: 'ai-tv',
    category: 'ai-screen',
    label: 'AI电视剧',
    description: '明确涉及AI制作的电视节目、剧集与流程资料',
  },
  {
    id: 'ai-short-drama',
    category: 'ai-screen',
    label: 'AI短剧',
    description: 'AI生成或辅助制作的短剧作品、创作与制作方法',
  },
  {
    id: 'ai-comic',
    category: 'ai-screen',
    label: 'AI漫剧',
    description: '明确涉及AI的漫剧与动态漫画作品及制作资料',
  },
  {
    id: 'ai-animation',
    category: 'ai-screen',
    label: 'AI动画',
    description: 'AI动画作品、制作过程与专业案例',
  },
  {
    id: 'ai-techniques',
    category: 'ai-screen',
    label: '创作与教程',
    description: 'AI影视创作技法、分镜、制作工作流、工具文档与公开教程',
  },
  {
    id: 'ai-industry',
    category: 'ai-screen',
    label: '行业动态',
    description: 'AI影视专业项目、技术进展与行业信息；排除娱乐八卦和无关AI热搜',
  },
] as const

export type SearchTopic = 'all' | (typeof SEARCH_TOPICS)[number]['id']
export const SearchTopicSchema = z.enum(['all', ...SEARCH_TOPICS.map(({ id }) => id)])
export const SEARCH_RESOURCE_TOPICS: Readonly<Record<string, readonly string[]>> = resourceTopics

export function topicFitsCategory(category: SearchCategory, topic: SearchTopic): boolean {
  return (
    topic === 'all' || SEARCH_TOPICS.some((item) => item.id === topic && item.category === category)
  )
}

export function topicMatches(resource: SearchResource, topic: SearchTopic): boolean {
  if (topic === 'all') return true
  if (!resource.category || !topicFitsCategory(resource.category, topic)) return false
  if (resource.subtopics?.includes(topic)) return true
  return resource.category === 'knowledge'
    ? knowledgeTopicMatches(resource.id, topic as KnowledgeTopic)
    : (SEARCH_RESOURCE_TOPICS[topic]?.includes(resource.id) ?? false)
}
