export type AiProviderConfig = {
  provider: 'openai' | 'aliyun'
  apiKey: string
  baseURL?: string
}

export function getAiProviderConfig(
  env: Record<string, string | undefined> = process.env,
): AiProviderConfig | null {
  const provider = env.DIASTAGE_AI_PROVIDER?.trim() || 'openai'
  if (provider !== 'openai' && provider !== 'aliyun') throw new Error('AI 服务商配置无效。')
  if (provider === 'openai') {
    const apiKey = env.OPENAI_API_KEY?.trim()
    return apiKey ? { provider, apiKey } : null
  }
  const raw = env.DASHSCOPE_BASE_URL?.trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('百炼北京服务地址配置无效。')
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    /[\\?#]/.test(raw) ||
    !(
      url.hostname === 'dashscope.aliyuncs.com' ||
      /^ws-[a-z0-9]+\.cn-beijing\.maas\.aliyuncs\.com$/.test(url.hostname)
    ) ||
    !/^\/compatible-mode\/v1\/?$/.test(url.pathname)
  )
    throw new Error('百炼北京服务地址配置无效。')
  const apiKey = env.DASHSCOPE_API_KEY?.trim()
  return apiKey ? { provider, apiKey, baseURL: `${url.origin}/compatible-mode/v1` } : null
}

export function isAiProviderConfigured(env: Record<string, string | undefined> = process.env) {
  try {
    return getAiProviderConfig(env) !== null
  } catch {
    return false
  }
}
