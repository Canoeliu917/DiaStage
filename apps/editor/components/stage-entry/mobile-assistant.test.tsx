import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MiniDiaStage, MobileDia } from './mobile-dia'
import { PhoneVoiceLink } from './phone-voice-link'
import { RemoteVoiceController } from './remote-voice-controller'
import { ScanTransfer } from './scan-transfer'

test('mobile assistant starts with Dia and secondary tools without a Canvas; unsaved scenes cannot pair', () => {
  const markup = renderToStaticMarkup(<RemoteVoiceController />)
  for (const label of ['手动置景', '复台', '8 位配对码']) expect(markup).toContain(label)
  for (const label of ['语音构台', '剧本搭台', '扫描上传', '排演'])
    expect(markup).not.toContain(label)
  expect(markup).not.toContain('<canvas')
  expect(markup).toContain('今天想怎么搭台？')
  expect(markup).toContain('<details class="mobile-assistant-tools">')
  expect(markup).not.toContain('class="assistant-entries"')
  expect(markup).not.toContain('/?entry=script')
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

test('mobile Dia starts disconnected, keeps voice lazy, and never offers remote adopt', () => {
  const markup = renderToStaticMarkup(
    <MobileDia
      session={{
        id: 'synthetic',
        sceneId: 'synthetic',
        remoteToken: 'synthetic-token',
        label: '合成场景',
        expiresAt: '2026-09-12T01:00:00.000Z',
      }}
    />,
  )
  expect(markup).toContain('当前预演状态尚未确认')
  expect(markup).toContain('说一句')
  expect(markup).toContain('发送给 Dia')
  expect(markup).not.toContain('正在打开录音')
  expect(markup).not.toContain('synthetic-token')
  expect(markup).not.toContain('采纳方案')
  expect(markup).not.toContain('<canvas')
})

test('mini stage is lightweight SVG and hides Ghost when owner confirmation is unavailable', () => {
  const performers = [{ id: 'A', name: 'A', position: [0, 0, 0] as [number, number, number] }]
  const snapshot = {
    version: 1 as const,
    sceneId: 'synthetic',
    sceneVersion: 'v1',
    thread: null,
    interactionId: 'i1',
    proposals: [],
    selectedProposalId: 'p1',
    state: 'ghost-ready' as const,
    statusText: '',
    decision: 'none' as const,
    synthetic: true,
    stage: {
      width: 8,
      depth: 6,
      origin: [0, 0, 0] as [number, number, number],
      performers,
      paths: [],
    },
    ghost: { proposalId: 'p1', performers, paths: [] },
  }
  const markup = renderToStaticMarkup(<MiniDiaStage snapshot={snapshot} />)
  expect(markup).toContain('<svg')
  expect(markup).toContain('mobile-dia__ghost-actor')
  expect(markup).not.toContain('<canvas')
  expect(
    renderToStaticMarkup(<MiniDiaStage snapshot={snapshot} showGhost={false} />),
  ).not.toContain('mobile-dia__ghost-actor')
  const build = {
    ...snapshot,
    stage: {
      ...snapshot.stage,
      scenery: [
        {
          id: 'table',
          name: '当前圆桌',
          min: [-1, -1] as [number, number],
          max: [1, 1] as [number, number],
        },
      ],
    },
    ghost: {
      ...snapshot.ghost,
      scenery: [
        {
          id: 'proposed-table',
          name: '建议圆桌',
          min: [-2, -1] as [number, number],
          max: [-1, 0] as [number, number],
        },
      ],
      venue: { width: 12, depth: 8, origin: snapshot.stage.origin },
    },
  }
  const buildMarkup = renderToStaticMarkup(<MiniDiaStage snapshot={build} />)
  expect(buildMarkup).toContain('mobile-dia__scenery')
  expect(buildMarkup).toContain('mobile-dia__ghost-scenery')
  expect(buildMarkup).toContain('建议场地边界')
  expect(buildMarkup).not.toContain('<canvas')
  const offline = renderToStaticMarkup(<MiniDiaStage snapshot={build} showGhost={false} />)
  expect(offline).toContain('当前圆桌')
  expect(offline).not.toContain('建议圆桌')
  expect(offline).not.toContain('建议场地边界')
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
