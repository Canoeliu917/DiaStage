import localFont from 'next/font/local'
import { DevDiagnostics } from './dev-diagnostics'
import './globals.css'

export const metadata = {
  title: '咫台 DiaStage: Theatre Rehearsal & Stage Previs',
  description: '咫台 — 戏剧排演与舞台复现。置景、人物走位与行动排演、跨场地复台。',
  icons: { icon: '/diastage-mark.svg' },
}

const sourceHanSans = localFont({
  src: './fonts/source-han-sans/SourceHanSansSC-VF.ttf.woff2',
  variable: '--font-source-han-sans',
  weight: '250 900',
  display: 'swap',
  adjustFontFallback: false,
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const enableDevDiagnostics =
    process.env.NODE_ENV === 'development' && process.env.DIASTAGE_DEV_DIAGNOSTICS === '1'

  return (
    <html className={sourceHanSans.variable} lang="zh-CN">
      <body className="font-sans">
        {children}
        <DevDiagnostics enabled={enableDevDiagnostics} />
      </body>
    </html>
  )
}
