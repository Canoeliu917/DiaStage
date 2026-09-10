import type { Metadata } from 'next'
import { RemoteVoiceController } from '@/components/stage-entry/remote-voice-controller'
import { StudioWordmark } from '@/components/studio-wordmark'

export const metadata: Metadata = {
  title: '舞台助手 · 咫台 DiaStage',
  description: '手机语音构台、手动置景、剧本搭台、复台与扫描上传。',
}

export default function RemoteVoicePage() {
  return (
    <main className="remote-voice-page">
      <StudioWordmark />
      <RemoteVoiceController />
      <p className="remote-voice-page__privacy">
        原始录音仅用于本次转写。扫描临时文件会在导入、放弃或到期后清理；电脑确认的扫描保存在该浏览器本机。
      </p>
    </main>
  )
}
