import { expect, mock, spyOn, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { realEvalCases, runRealEval } from './real-eval'

test('real evaluation samples 10 categories, caps at 20 and never fakes a missing-key run', async () => {
  expect(new Set(realEvalCases(10).map((item) => item.category)).size).toBe(10)
  expect(new Set(realEvalCases(20).map((item) => item.caseId)).size).toBe(20)
  for (const count of [0, 9, 21, 10.5, NaN]) expect(() => realEvalCases(count)).toThrow()
  const key = process.env.OPENAI_API_KEY
  const provider = process.env.DIASTAGE_AI_PROVIDER
  try {
    process.env.DIASTAGE_AI_PROVIDER = 'openai'
    delete process.env.OPENAI_API_KEY
    expect(await runRealEval()).toEqual({
      REAL_MODEL_EVAL: 'NOT_RUN',
      reason: 'AI_PROVIDER_NOT_CONFIGURED',
      attempted: 0,
    })
  } finally {
    if (key === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = key
    if (provider === undefined) delete process.env.DIASTAGE_AI_PROVIDER
    else process.env.DIASTAGE_AI_PROVIDER = provider
  }
})

test('missing or uninvited evaluation identity stops before changing cwd, writing or networking', async () => {
  const names = [
    'OPENAI_API_KEY',
    'DIASTAGE_AI_PROVIDER',
    'DASHSCOPE_API_KEY',
    'DASHSCOPE_BASE_URL',
    'DIASTAGE_REAL_EVAL_USER_ID',
    'DIASTAGE_AI_BETA_USER_IDS',
  ]
  const previous = names.map((name) => process.env[name])
  const cwd = process.cwd()
  const originalFetch = globalThis.fetch
  const chdir = spyOn(process, 'chdir').mockImplementation(() => {
    throw new Error('Evaluation must not change cwd')
  })
  const mkdir = spyOn(fs, 'mkdir').mockRejectedValue(new Error('Evaluation must not create files'))
  const writeFile = spyOn(fs, 'writeFile').mockRejectedValue(new Error('Evaluation must not write'))
  const rename = spyOn(fs, 'rename').mockRejectedValue(new Error('Evaluation must not rename'))
  const fetch = mock(async () => {
    throw new Error('Network is forbidden in evaluation tests')
  })
  globalThis.fetch = fetch as typeof globalThis.fetch
  try {
    process.env.OPENAI_API_KEY = 'synthetic-eval-key'
    process.env.DIASTAGE_AI_PROVIDER = 'aliyun'
    process.env.DASHSCOPE_API_KEY = 'synthetic-aliyun-key'
    delete process.env.DASHSCOPE_BASE_URL
    process.env.DIASTAGE_AI_BETA_USER_IDS = 'other-invited-user'
    for (const userId of [undefined, '', ' \t ']) {
      if (userId === undefined) delete process.env.DIASTAGE_REAL_EVAL_USER_ID
      else process.env.DIASTAGE_REAL_EVAL_USER_ID = userId
      expect(await runRealEval()).toEqual({
        REAL_MODEL_EVAL: 'NOT_RUN',
        reason: 'EVAL_USER_ID_NOT_CONFIGURED',
        attempted: 0,
      })
    }
    process.env.DIASTAGE_REAL_EVAL_USER_ID = 'evaluation-user'
    expect(await runRealEval()).toEqual({
      REAL_MODEL_EVAL: 'NOT_RUN',
      reason: 'EVAL_USER_NOT_INVITED',
      attempted: 0,
    })
    expect(chdir).not.toHaveBeenCalled()
    expect(mkdir).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
    expect(rename).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    mock.restore()
    process.chdir(cwd)
    globalThis.fetch = originalFetch
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name]
      else process.env[name] = previous[index]
    })
  }
})

test('the exact trimmed invited identity reaches provider context without approving costs', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'diastage-real-eval-test-'))
  const code = `
    import assert from 'node:assert/strict'
    import * as fs from 'node:fs/promises'
    import { createRequire } from 'node:module'
    import { plugin } from 'bun'
    import { mock, spyOn } from 'bun:test'
    const require = createRequire(${JSON.stringify(import.meta.url)})
    const cwd = process.cwd()
    const originalFetch = globalThis.fetch
    let fetchCalls = 0
    globalThis.fetch = async () => {
      fetchCalls++
      throw new Error('Network is forbidden in evaluation tests')
    }
    const mkdir = mock(async () => undefined)
    const writeFile = mock(async () => undefined)
    const rename = mock(async () => undefined)
    mock.module('node:fs/promises', () => ({ ...fs, mkdir, writeFile, rename }))
    plugin({
      name: 'next-server-only-evaluation-test',
      setup(build) {
        build.module('server-only', () => ({
          exports: require('next/dist/compiled/server-only/empty.js'), loader: 'object',
        }))
      },
    })
    try {
      const provider = await import(${JSON.stringify(new URL('./openai-server.ts', import.meta.url).href)})
      const { aiRequestContext } = await import(${JSON.stringify(new URL('../ai/usage.ts', import.meta.url).href)})
      let providerCalls = 0
      spyOn(provider, 'requestRehearsalOutput').mockImplementation(async (context) => {
        providerCalls++
        const current = aiRequestContext.getStore()
        assert.equal(current.userId, 'evaluation-user')
        assert.equal(current.approvedCny, undefined)
        return {
          context, modelVersion: 'synthetic-eval-fixture',
          rawStructuredOutput: null, status: 'completed',
        }
      })
      const { runRealEval } = await import(${JSON.stringify(new URL('./real-eval.ts', import.meta.url).href)})
      const report = await runRealEval()
      assert.equal(report.REAL_MODEL_EVAL, 'RUN')
      assert.equal(report.attempted, 10)
      assert.equal(report.responses, 10)
      assert.equal(providerCalls, 10)
      assert.equal(fetchCalls, 0)
      assert.ok(mkdir.mock.calls.length > 0)
      assert.ok(writeFile.mock.calls.length > 0)
      assert.ok(rename.mock.calls.length > 0)
      console.log(JSON.stringify({ providerCalls, fetchCalls, attempted: report.attempted }))
    } finally {
      mock.restore()
      process.chdir(cwd)
      globalThis.fetch = originalFetch
      plugin.clearAll()
    }
  `
  try {
    const child = Bun.spawn([process.execPath, '--no-env-file', '-e', code], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: tmpdir(),
        TMP: tmpdir(),
        DIASTAGE_AI_PROVIDER: 'aliyun',
        DASHSCOPE_API_KEY: 'synthetic-aliyun-key',
        DIASTAGE_REAL_EVAL_USER_ID: '  evaluation-user \t',
        DIASTAGE_AI_BETA_USER_IDS: 'different-first-user,evaluation-user',
        DIASTAGE_AI_LEDGER_PATH: join(fixture, 'ai-usage.db'),
        PASCAL_DB_PATH: join(fixture, 'scenes.db'),
        DIASTAGE_AUTH_EMAIL_ENABLED: 'false',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' })
    expect(JSON.parse(stdout)).toEqual({ providerCalls: 10, fetchCalls: 0, attempted: 10 })
    expect(await fs.readdir(fixture)).toEqual([])
  } finally {
    expect(dirname(resolve(fixture))).toBe(resolve(tmpdir()))
    rmSync(fixture, { recursive: true, force: true })
  }
})
