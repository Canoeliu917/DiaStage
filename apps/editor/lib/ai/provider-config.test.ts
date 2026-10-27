import { expect, test } from 'bun:test'
import { DiaBuildProposalSchema } from '../rehearsal-intelligence/dia-backbone'
import { emptyGrounding } from '../rehearsal-intelligence/open-language'
import { OpenGroundingResponseSchema } from '../rehearsal-intelligence/open-language-client'
import { getAiProviderConfig, isAiProviderConfigured } from './provider-config'

test('default OpenAI selection only accepts its own nonempty key', () => {
  expect(getAiProviderConfig({})).toBeNull()
  expect(getAiProviderConfig({ OPENAI_API_KEY: ' \t ' })).toBeNull()
  expect(getAiProviderConfig({ DASHSCOPE_API_KEY: 'synthetic-aliyun' })).toBeNull()
  expect(getAiProviderConfig({ OPENAI_API_KEY: ' synthetic-openai ' })).toEqual({
    provider: 'openai',
    apiKey: 'synthetic-openai',
  })
})

test('Aliyun selection never falls back to a leftover OpenAI key', () => {
  const env = { DIASTAGE_AI_PROVIDER: 'aliyun', OPENAI_API_KEY: 'synthetic-openai' }
  expect(getAiProviderConfig(env)).toBeNull()
  expect(isAiProviderConfigured(env)).toBe(false)
  expect(getAiProviderConfig({ ...env, DASHSCOPE_API_KEY: ' synthetic-aliyun ' })).toEqual({
    provider: 'aliyun',
    apiKey: 'synthetic-aliyun',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  })
})

test('Beijing official general and workspace endpoints normalize one trailing slash', () => {
  for (const host of ['dashscope.aliyuncs.com', 'ws-synthetic123.cn-beijing.maas.aliyuncs.com']) {
    const env = {
      DIASTAGE_AI_PROVIDER: 'aliyun',
      DASHSCOPE_API_KEY: 'synthetic-aliyun',
      DASHSCOPE_BASE_URL: `https://${host}/compatible-mode/v1/`,
    }
    expect(getAiProviderConfig(env)?.baseURL).toBe(`https://${host}/compatible-mode/v1`)
    expect(isAiProviderConfigured(env)).toBe(true)
  }
})

test('untrusted Aliyun destinations fail closed without exposing config values', () => {
  for (const url of [
    'not-a-url',
    'http://dashscope.aliyuncs.com/compatible-mode/v1',
    'https://dashscope.aliyuncs.com.evil.example/compatible-mode/v1',
    'https://ws-synthetic.cn-shanghai.maas.aliyuncs.com/compatible-mode/v1',
    'https://dashscope.aliyuncs.com:444/compatible-mode/v1',
    'https://secret:password@dashscope.aliyuncs.com/compatible-mode/v1',
    'https://dashscope.aliyuncs.com/compatible-mode/v1?key=secret',
    'https://dashscope.aliyuncs.com/compatible-mode/v1#secret',
    'https://dashscope.aliyuncs.com/compatible-mode/v1?',
    'https://dashscope.aliyuncs.com/compatible-mode/v1/extra',
    'https://dashscope.aliyuncs.com\\compatible-mode\\v1',
  ]) {
    const env = {
      DIASTAGE_AI_PROVIDER: 'aliyun',
      DASHSCOPE_API_KEY: 'synthetic-private-key',
      DASHSCOPE_BASE_URL: url,
    }
    expect(() => getAiProviderConfig(env)).toThrow('百炼北京服务地址配置无效。')
    expect(isAiProviderConfigured(env)).toBe(false)
  }
  expect(() => getAiProviderConfig({ DIASTAGE_AI_PROVIDER: 'unsupported-secret' })).toThrow(
    'AI 服务商配置无效。',
  )
  expect(isAiProviderConfigured({ DIASTAGE_AI_PROVIDER: 'unsupported-secret' })).toBe(false)
})

test('client grounding and persisted proposals accept only supported provider identities', () => {
  for (const provider of ['openai', 'aliyun']) {
    expect(
      OpenGroundingResponseSchema.parse({
        requestId: crypto.randomUUID(),
        grounding: emptyGrounding('synthetic'),
        provider,
        model: 'synthetic-model',
      }).provider,
    ).toBe(provider)
    expect(
      DiaBuildProposalSchema.shape.groundingProvider.parse({ provider, model: 'synthetic-model' }),
    ).toEqual({ provider, model: 'synthetic-model' })
  }
  expect(
    DiaBuildProposalSchema.shape.groundingProvider.safeParse({ provider: 'unknown', model: null })
      .success,
  ).toBe(false)
})
