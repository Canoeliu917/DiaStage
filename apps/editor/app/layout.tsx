import localFont from 'next/font/local'
import type { CSSProperties } from 'react'
import { DIASTAGE_BRAND } from '@/lib/brand'
import { DIA_CSS_VARIABLES } from '@/lib/visual-system'
import { DevDiagnostics } from './dev-diagnostics'
import './globals.css'

export const metadata = {
  title: '咫台 DiaStage: Stage Build & Remount Preview',
  description: DIASTAGE_BRAND.product,
  icons: { icon: '/diastage-mark.svg' },
}

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

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
    <html
      className={sourceHanSans.variable}
      lang="zh-CN"
      style={DIA_CSS_VARIABLES as CSSProperties}
    >
      <body className="font-sans">
        {children}
        <DevDiagnostics enabled={enableDevDiagnostics} />
      </body>
    </html>
  )
}
