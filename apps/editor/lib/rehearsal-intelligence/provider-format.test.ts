import { expect, test } from 'bun:test'
import { zodTextFormat } from 'openai/helpers/zod'
import { AgentOutputSchema, type Suggestion } from './schema'

const legacy: Suggestion = {
  id: 'suggestion-a',
  performerId: 'a',
  intention: '先保持位置',
  movement: 'hold',
  targetPerformerId: null,
  zone: null,
  extent: 'small',
  pace: 'slow',
}
const output = (suggestion: Suggestion) => ({
  dramaticState: [],
  proposals: [
    {
      title: '站位尝试',
      intention: '由人决定是否采用',
      rationale: '先比较与布景的关系',
      suggestions: [suggestion],
      alternatives: [],
      evidence: [],
      confidence: 1,
    },
  ],
})

test('the actual OpenAI SDK emits required nullable object references without losing strictness', () => {
  const format = zodTextFormat(AgentOutputSchema, 'rehearsal_possibilities')
  expect(format.strict).toBe(true)
  expect(() => JSON.stringify(format)).not.toThrow()
  expect(format.schema).toMatchObject({
    additionalProperties: false,
    properties: {
      proposals: {
        items: {
          additionalProperties: false,
          properties: {
            suggestions: {
              items: {
                additionalProperties: false,
                required: expect.arrayContaining(['targetObjectId', 'movement']),
                properties: {
                  targetObjectId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  movement: { enum: expect.arrayContaining(['stand-near-object', 'hold']) },
                },
              },
            },
          },
        },
      },
    },
  })
})

test('legacy records and new structured outputs parse while arbitrary coordinates remain rejected', () => {
  const format = zodTextFormat(AgentOutputSchema, 'rehearsal_possibilities')
  expect(AgentOutputSchema.parse(output(legacy))).toEqual(output(legacy))
  for (const suggestion of [
    { ...legacy, targetObjectId: null },
    { ...legacy, movement: 'stand-near-object' as const, targetObjectId: 'real-door-id' },
  ]) {
    expect(format.$parseRaw(JSON.stringify(output(suggestion)))).toEqual(output(suggestion))
  }
  const invalid = { ...legacy, targetPosition: [0, 0, 0] }
  expect(() => format.$parseRaw(JSON.stringify(output(invalid)))).toThrow()
})
