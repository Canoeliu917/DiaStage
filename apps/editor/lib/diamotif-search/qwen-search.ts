export const QWEN_NATIVE_SEARCH_PATH = '/api/v1/services/aigc/multimodal-generation/generation'

export const QWEN_NOTICES = {
  emptyLibrary: '已审资料库中暂无与这次查询匹配的记录，没有编造答案。',
  keyMissing:
    '千问尚未配置。请在服务端设置 DIASTAGE_AI_PROVIDER=aliyun 与 DASHSCOPE_API_KEY 后重启；不要把密钥写入网页或仓库。',
  callFailed: '千问调用没有完成，没有返回答案。请检查服务端到百炼北京接口的网络后重试。',
  unreviewedWeb: '下列联网候选尚未审核，不会进入公开检索。',
  noWebCandidates: '联网服务未返回符合范围的候选。',
  cited: 'DIA 根据本次已审资料回答；联网公告待复核，知识与完整作品仅展示已审核来源。',
  citationRejected:
    '联网检索已完成，但回答缺少有效引用或引用未通过范围校验，未显示答案；已保留可用资料。',
  loginRequired: '请先登录后使用千问回答；已审资料检索不受影响。',
  inviteRequired: '千问回答暂向受邀内测账号开放；已审资料检索不受影响。',
  budgetExceeded: '当前千问额度不足，未开始新的调用；已审资料检索不受影响。',
  budgetConfirm: '本次千问预留估算超过提醒额度，未开始调用；已审资料仍可检索。',
  localStillOpen: '以下已审资料仍可检索与打开。',
} as const

export function qwenNativeSearchEndpoint(baseURL: string) {
  const url = new URL(baseURL)
  return `${url.origin}${QWEN_NATIVE_SEARCH_PATH}`
}

export function describeQwenFailure(input: {
  httpStatus: number
  code?: string
  message?: string
  localCount: number
}) {
  let detail: string
  if (input.httpStatus === 401) detail = QWEN_NOTICES.loginRequired
  else if (input.code === 'AI_INVITE_REQUIRED') detail = QWEN_NOTICES.inviteRequired
  else if (input.code === 'BUDGET_EXCEEDED') detail = QWEN_NOTICES.budgetExceeded
  else if (input.code === 'BUDGET_CONFIRMATION_REQUIRED') detail = QWEN_NOTICES.budgetConfirm
  else if (input.message?.includes('尚未配置')) detail = QWEN_NOTICES.keyMissing
  else if (input.code === 'PLAN_INVALID' && input.message) detail = input.message
  else detail = QWEN_NOTICES.callFailed
  if (input.localCount > 0 || detail.includes('暂无')) return detail
  return `${QWEN_NOTICES.emptyLibrary}${detail}`
}

export function describeSmartSearchResult(input: {
  localCount: number
  webCount: number
  answered: boolean
}) {
  if (input.localCount === 0)
    return `${QWEN_NOTICES.emptyLibrary}${input.webCount ? QWEN_NOTICES.unreviewedWeb : QWEN_NOTICES.noWebCandidates}`
  if (input.answered) return QWEN_NOTICES.cited
  return QWEN_NOTICES.citationRejected
}
