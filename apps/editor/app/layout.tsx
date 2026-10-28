import localFont from 'next/font/local'
import { headers } from 'next/headers'
import Script from 'next/script'
import type { CSSProperties } from 'react'
import { AccountSessionBoundary } from '@/components/account-session-boundary'
import { StageThemeProvider } from '@/components/stage-theme'
import { getSession } from '@/lib/auth/server'
import { DIASTAGE_BRAND } from '@/lib/brand'
import { STAGE_THEME_BOOTSTRAP } from '@/lib/stage-theme'
import { DIA_CSS_VARIABLES } from '@/lib/visual-system'
import { DevDiagnostics } from './dev-diagnostics'
import './globals.css'
import './brand-paper.css'
import './stage-theme.css'

export const metadata = {
  title: '咫台 DiaStage: AI Stage Set',
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const enableDevDiagnostics =
    process.env.NODE_ENV === 'development' && process.env.DIASTAGE_DEV_DIAGNOSTICS === '1'
  const session = await getSession(await headers())

  return (
    <html
      className={sourceHanSans.variable}
      lang="zh-CN"
      style={DIA_CSS_VARIABLES as CSSProperties}
      suppressHydrationWarning
    >
      <body className="font-sans">
        <Script id="diastage-stage-theme" strategy="beforeInteractive">
          {STAGE_THEME_BOOTSTRAP}
        </Script>
        <StageThemeProvider>{children}</StageThemeProvider>
        <AccountSessionBoundary userId={session?.user.id ?? null} />
        <DevDiagnostics enabled={enableDevDiagnostics} />
      </body>
    </html>
  )
}
