import { expect, test } from 'bun:test'
import {
  describeQwenFailure,
  describeSmartSearchResult,
  QWEN_NOTICES,
  qwenNativeSearchEndpoint,
} from './qwen-search'

test('native search endpoint stays on the configured Bailian host', () => {
  expect(qwenNativeSearchEndpoint('https://dashscope.aliyuncs.com/compatible-mode/v1')).toBe(
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
  )
  expect(
    qwenNativeSearchEndpoint(
      'https://ws-synthetic123.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/',
    ),
  ).toBe(
    'https://ws-synthetic123.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
  )
})

test('empty library, missing key and failed calls stay distinct', () => {
  const empty = describeQwenFailure({ httpStatus: 200, localCount: 0, code: 'PLAN_INVALID' })
  const missingKey = describeQwenFailure({
    httpStatus: 503,
    localCount: 3,
    message: '千问尚未配置',
  })
  const failed = describeQwenFailure({ httpStatus: 502, localCount: 3, code: 'INTERNAL_ERROR' })
  expect(empty).toContain('暂无')
  expect(empty).not.toContain('密钥')
  expect(empty).not.toContain('额度')
  expect(missingKey).toBe(QWEN_NOTICES.keyMissing)
  expect(missingKey).not.toContain('暂无')
  expect(failed).toBe(QWEN_NOTICES.callFailed)
  expect(failed).not.toContain('额度')
  expect(new Set([empty, missingKey, failed]).size).toBe(3)
})

test('a smart answer without reviewed samples does not pretend the library matched', () => {
  expect(describeSmartSearchResult({ localCount: 0, webCount: 1, answered: false })).toContain(
    '暂无',
  )
  expect(describeSmartSearchResult({ localCount: 0, webCount: 1, answered: false })).toContain(
    '不会进入公开检索',
  )
  expect(describeSmartSearchResult({ localCount: 2, webCount: 0, answered: true })).toContain(
    '已审资料',
  )
})
