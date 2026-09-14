import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseViewCommand } from './view-commands'

const cases = readFileSync(
  resolve(
    import.meta.dir,
    '../../../../.agents/skills/dia-language-trainer/evals/camera-intents.jsonl',
  ),
  'utf8',
)
  .trim()
  .split('\n')
  .map(
    (line) =>
      JSON.parse(line) as {
        id: string
        utterance: string
        expected_intent?: string
        expected_intents?: string[]
        expected_projection?: string
        expected_target?: string
        clarify: boolean
      },
  )

// Normalize the existing command vocabulary without inferring anything from the input text.
function prediction(command: ReturnType<typeof parseViewCommand>) {
  if (!command) return null
  if (command.type === 'CAMERA_INTENT') return command
  if (command.type === 'SET_VIEW')
    return {
      intents: [command.view === 'top' ? 'top_orthographic' : `${command.view}_view`],
      projection: 'orthographic',
      clarify: false,
    }
  if (command.type === 'ORBIT_VIEW')
    return { intents: [`orbit_${command.direction}`], clarify: false }
  if (command.type === 'FRAME_SELECTION')
    return { intents: ['focus_selection'], target: 'selection', clarify: false }
  return null
}

test('canonical camera eval inventory contains exactly 36 unique cases', () => {
  expect(cases).toHaveLength(36)
  expect(new Set(cases.map((item) => item.id)).size).toBe(36)
})

for (const item of cases)
  test(`${item.id}: ${item.utterance}`, () => {
    const actual = prediction(parseViewCommand(item.utterance))
    expect(actual?.intents).toEqual(item.expected_intents ?? [item.expected_intent])
    expect(actual?.clarify).toBe(item.clarify)
    if (item.expected_projection) expect(actual?.projection).toBe(item.expected_projection)
    if (item.expected_target)
      expect(actual && 'target' in actual ? actual.target : undefined).toBe(item.expected_target)
  })
