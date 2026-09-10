import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { PhoneVoiceLink } from './phone-voice-link'
import { RemoteVoiceController } from './remote-voice-controller'
import { ScanTransfer } from './scan-transfer'

test('mobile assistant has five direct entries without a Canvas; unsaved scenes cannot pair', () => {
  const markup = renderToStaticMarkup(<RemoteVoiceController />)
  for (const label of ['语音构台', '手动置景', '剧本搭台', '复台', '扫描上传', '8 位配对码'])
    expect(markup).toContain(label)
  expect(markup).not.toContain('<canvas')
  expect(markup).toContain('/?entry=script')
  expect(markup).toContain('/?entry=manual')
  const owner = renderToStaticMarkup(
    <PhoneVoiceLink
      sceneLabel="合成场景"
      storageKey="synthetic"
      canLoad
      onTranscript={async () => {}}
    />,
  )
  expect(owner).toMatch(/<button[^>]+disabled=""[^>]*>生成配对码/)
  expect(owner).toContain('先建立并保存舞台')
})

test('scan upload uses GLB only, no browser LiDAR claim or automatic import control', () => {
  const session = {
    id: crypto.randomUUID(),
    sceneId: 'synthetic-scene',
    remoteToken: 'synthetic-token',
    label: '合成场景',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }
  const markup = renderToStaticMarkup(<ScanTransfer session={session} />)
  expect(markup).toContain('accept=".glb,model/gltf-binary"')
  expect(markup).toContain('网页本身不进行 LiDAR 扫描')
  expect(markup).not.toContain('确认导入扫描')
  expect(markup).not.toContain(session.remoteToken)
  expect(renderToStaticMarkup(<ScanTransfer session={{ ...session, sceneId: null }} />)).toMatch(
    /<input[^>]+disabled=""/,
  )
})
