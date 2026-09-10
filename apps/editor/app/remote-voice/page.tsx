import type { Metadata } from 'next'
import { RemoteVoiceController } from '@/components/stage-entry/remote-voice-controller'
import { StudioWordmark } from '@/components/studio-wordmark'

export const metadata: Metadata = {
  title: 'iPhone 舞台口令 · 咫台 DiaStage',
  description: '将 iPhone 作为咫台的第二屏语音输入器。',
}

export default function RemoteVoicePage() {
  return (
    <main className="remote-voice-page">
      <StudioWordmark />
      <RemoteVoiceController />
      <p className="remote-voice-page__privacy">
        手机只发送经你校对的文字。原始录音仅用于本次转写，不写入舞台项目。
      </p>
    </main>
  )
}
