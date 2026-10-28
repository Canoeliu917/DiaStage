import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { StageTaskCards } from './stage-first-visit'

test('first-use choices offer three staging actions without rehearsal or technical jargon', () => {
  const markup = renderToStaticMarkup(
    <StageTaskCards onPlace={() => {}} onDescribe={() => {}} onImport={() => {}} />,
  )
  expect(markup.match(/<button /g)).toHaveLength(3)
  for (const label of ['放一件道具', '描述一套布景', '导入照片或剧本'])
    expect(markup).toContain(label)
  expect(markup).not.toMatch(/Prompt|Token|Agent|复台|路线|录音/i)
  const disabled = renderToStaticMarkup(
    <StageTaskCards disabled onPlace={() => {}} onDescribe={() => {}} onImport={() => {}} />,
  )
  expect(disabled.match(/disabled=""/g)).toHaveLength(3)
})
