import type OpenAI from 'openai'
import type { AutoParseableTextFormat } from 'openai/lib/parser'
import { QWEN_TRIAL_MODEL } from './model-pricing'

function tokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export async function requestAliyunStructured<T>({
  client,
  instructions,
  inputText,
  imageDataUrl,
  maxOutputTokens,
  format,
  signal,
}: {
  client: OpenAI
  instructions: string
  inputText: string
  imageDataUrl?: string
  maxOutputTokens: number
  format: AutoParseableTextFormat<T>
  signal: AbortSignal
}) {
  signal.throwIfAborted()
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0)
    throw new Error('Aliyun trial requires an explicit positive output limit')
  if (
    format.type !== 'json_schema' ||
    format.strict !== true ||
    typeof format.$parseRaw !== 'function'
  )
    throw new Error('Aliyun trial requires a strict SDK structured-output format')
  if (
    imageDataUrl !== undefined &&
    (typeof imageDataUrl !== 'string' ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(imageDataUrl))
  )
    throw new Error('Aliyun trial accepts one image data URL only')

  const body = {
    model: QWEN_TRIAL_MODEL,
    messages: [
      { role: 'system' as const, content: instructions },
      {
        role: 'user' as const,
        content:
          imageDataUrl === undefined
            ? inputText
            : [
                { type: 'text' as const, text: inputText },
                { type: 'image_url' as const, image_url: { url: imageDataUrl } },
              ],
      },
    ],
    response_format: {
      type: 'json_schema' as const,
      json_schema: { name: format.name, strict: true, schema: format.schema },
    },
    enable_thinking: false,
    stream: false as const,
    max_completion_tokens: maxOutputTokens,
    ...(imageDataUrl === undefined ? {} : { vl_high_resolution_images: true }),
  }
  const response = await client.chat.completions.create(body, { signal, maxRetries: 0 })
  signal.throwIfAborted()
  const choice = response?.choices?.[0]
  if (
    response?.model !== QWEN_TRIAL_MODEL ||
    !Array.isArray(response.choices) ||
    response.choices.length !== 1 ||
    choice?.finish_reason !== 'stop' ||
    choice.message?.role !== 'assistant' ||
    (choice.message.refusal !== undefined &&
      choice.message.refusal !== null &&
      choice.message.refusal !== '') ||
    (choice.message.tool_calls !== undefined &&
      choice.message.tool_calls !== null &&
      (!Array.isArray(choice.message.tool_calls) || choice.message.tool_calls.length !== 0)) ||
    choice.message.function_call ||
    typeof choice.message.content !== 'string' ||
    !choice.message.content.trim()
  )
    throw new Error('Aliyun trial rejected incomplete, refused or non-text output')

  const usage = response.usage
  const details = usage?.prompt_tokens_details
  const input = usage?.prompt_tokens
  const output = usage?.completion_tokens
  const cached = details?.cached_tokens === undefined ? 0 : details.cached_tokens
  if (
    (details !== undefined &&
      (details === null || typeof details !== 'object' || Array.isArray(details))) ||
    !tokenCount(input) ||
    !tokenCount(output) ||
    input === 0 ||
    output === 0 ||
    !tokenCount(cached) ||
    !tokenCount(usage?.total_tokens) ||
    usage.total_tokens !== input + output ||
    cached > input ||
    output > maxOutputTokens + 10
  )
    throw new Error('Aliyun trial rejected missing or invalid token usage')

  let parsed: T
  try {
    parsed = format.$parseRaw(choice.message.content)
  } catch {
    throw new Error('Aliyun trial rejected invalid structured output')
  }
  signal.throwIfAborted()
  return {
    status: 'completed' as const,
    output_parsed: parsed,
    output_text: choice.message.content,
    usage: {
      input_tokens: input,
      output_tokens: output,
      input_tokens_details: {
        cached_tokens: cached,
        cache_write_tokens: 0 as const,
        cache_write_tokens_details: { ttl_12h_tokens: 0 as const },
      },
    },
  }
}
