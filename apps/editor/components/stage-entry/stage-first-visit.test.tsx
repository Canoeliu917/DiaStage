import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { StageTaskCards } from './stage-first-visit'

test('first-use choices offer three staging actions without rehearsal or technical jargon', () => {
  const markup = renderToStaticMarkup(<StageTaskCards onPrefill={() => {}} />)
  expect(markup.match(/<button /g)).toHaveLength(3)
  for (const label of ['放一件道具', '描述一套布景', '导入照片或剧本'])
    expect(markup).toContain(label)
  expect(markup).not.toMatch(/Prompt|Token|Agent|复台|路线|录音/i)
  const disabled = renderToStaticMarkup(<StageTaskCards disabled onPrefill={() => {}} />)
  expect(disabled.match(/disabled=""/g)).toHaveLength(3)
})

test('each starter only supplies an editable Chinese draft', () => {
  const drafts: string[] = []
  const cards = StageTaskCards({ onPrefill: (text) => drafts.push(text) })
  for (const button of cards.props.children) button.props.onClick()
  expect(drafts).toEqual([
    '在舞台中区放一把硬椅。',
    '在舞台中区放一张圆桌，桌子两侧各放一把硬椅。',
    '请根据我附上的照片或剧本，用现有道具生成排练布景，保留主要位置关系。',
  ])
})
