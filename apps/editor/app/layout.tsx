import { Agentation } from 'agentation'
import localFont from 'next/font/local'
import { ClientBootstrap } from './client-bootstrap'
import './globals.css'

export const metadata = {
  title: '咫台 · AI Dramaturgy & Spatial Previs',
  description: '咫台 — AI Dramaturgy & Spatial Previs。搭建空间、调度镜头与预演场景序列。',
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
    process.env.NODE_ENV === 'development' && process.env.PASCAL_DEV_DIAGNOSTICS === '1'

  return (
    <html className={sourceHanSans.variable} lang="zh-CN">
      <body className="font-sans">
        <ClientBootstrap enableDevDiagnostics={enableDevDiagnostics}>{children}</ClientBootstrap>
        {enableDevDiagnostics && <Agentation />}
      </body>
    </html>
  )
}
