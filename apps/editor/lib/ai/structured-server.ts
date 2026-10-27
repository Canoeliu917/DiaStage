import 'server-only'
import OpenAI from 'openai'
import type { AutoParseableTextFormat } from 'openai/lib/parser'
import { requestAliyunStructured } from './aliyun-chat'
import { AI_LIMITS, AiError } from './api'
import { QWEN_TRIAL_MODEL } from './model-pricing'
import { getAiProviderConfig } from './provider-config'
import { type AiUsageRecord, trackAiCall } from './usage'

type StructuredFeature = Exclude<AiUsageRecord['feature'], 'voice-transcription'>

function providerConfig() {
  let config: ReturnType<typeof getAiProviderConfig>
  try {
    config = getAiProviderConfig()
  } catch {
    throw new AiError('INTERNAL_ERROR', 'AI 服务配置不可用，请联系管理员；可继续手动置景。', 503)
  }
  if (!config)
    throw new AiError('INTERNAL_ERROR', 'AI 服务尚未配置，可继续使用本地口令和手动置景。', 503)
  return config
}

function selectedModel(provider: 'openai' | 'aliyun', feature: StructuredFeature) {
  if (provider === 'aliyun') return QWEN_TRIAL_MODEL
  return feature === 'script-stage-plan'
    ? process.env.DIASTAGE_SCRIPT_MODEL || 'gpt-5.6-luna'
    : feature === 'rehearsal-proposal'
      ? process.env.DIASTAGE_REHEARSAL_MODEL || process.env.DIASTAGE_COMMAND_MODEL || 'gpt-5.6-luna'
      : process.env.DIASTAGE_COMMAND_MODEL || 'gpt-5.6-luna'
}

export function structuredModel(feature: StructuredFeature) {
  return selectedModel(providerConfig().provider, feature)
}

export async function requestStructuredOutput<T>({
  feature,
  instructions,
  inputText,
  imageDataUrl,
  maxOutputTokens,
  format,
  signal,
}: {
  feature: StructuredFeature
  instructions: string
  inputText: string
  imageDataUrl?: string
  maxOutputTokens: number
  format: AutoParseableTextFormat<T>
  signal: AbortSignal
}) {
  signal.throwIfAborted()
  if ((feature === 'photo-stage-plan') !== (imageDataUrl !== undefined))
    throw new Error('Image input must match the photo budget feature')
  const config = providerConfig()
  const model = selectedModel(config.provider, feature)
  const client = new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    ...(config.provider === 'aliyun' ? { organization: null, project: null } : {}),
    maxRetries: 0,
    timeout: AI_LIMITS.requestTimeoutMs,
  })
  // Qwen image tokens are reserved by estimateCall; GPT retains its existing patch allowance.
  const budgetPayload =
    instructions +
    inputText +
    JSON.stringify(format) +
    (imageDataUrl && config.provider === 'openai' ? ' '.repeat(3001) : '')
  const response = await trackAiCall(
    feature,
    model,
    signal,
    async () => {
      if (config.provider === 'aliyun')
        return requestAliyunStructured({
          client,
          instructions,
          inputText,
          imageDataUrl,
          maxOutputTokens,
          format,
          signal,
        })
      const request = {
        model,
        store: false,
        max_output_tokens: maxOutputTokens,
        instructions,
        input: [
          {
            role: 'user',
            content:
              imageDataUrl === undefined
                ? inputText
                : [
                    { type: 'input_text', text: inputText },
                    { type: 'input_image', image_url: imageDataUrl, detail: 'high' },
                  ],
          },
        ],
        text: { format },
      } satisfies OpenAI.Responses.ResponseCreateParamsNonStreaming
      if (feature === 'rehearsal-proposal') {
        const response = await client.responses.create(request, { signal, maxRetries: 0 })
        return { ...response, output_parsed: null }
      }
      return client.responses.parse(request, { signal, maxRetries: 0 })
    },
    (result) => result.usage,
    null,
    budgetPayload,
  )
  return { ...response, provider: config.provider, model }
}
