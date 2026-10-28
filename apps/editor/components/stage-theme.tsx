'use client'

import { useViewer } from '@pascal-app/viewer'
import { Monitor, Moon, Sun } from 'lucide-react'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import {
  resolveStageTheme,
  STAGE_THEME_STORAGE_KEY,
  type StageThemePreference,
  stageThemePreference,
} from '@/lib/stage-theme'

const StageThemeContext = createContext({
  preference: 'system' as StageThemePreference,
  theme: 'day' as 'day' | 'night',
  choose: (_value: StageThemePreference) => {},
})

export function StageThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<StageThemePreference>('system')
  const [dark, setDark] = useState(false)
  const [ready, setReady] = useState(false)
  const theme = resolveStageTheme(preference, dark)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const syncSystem = () => setDark(media.matches)
    const syncPreference = () => {
      try {
        setPreference(stageThemePreference(localStorage.getItem(STAGE_THEME_STORAGE_KEY)))
      } catch {
        setPreference('system')
      }
    }
    const syncStorage = (event: StorageEvent) => {
      if (event.key === STAGE_THEME_STORAGE_KEY || event.key === null) syncPreference()
    }
    syncSystem()
    syncPreference()
    setReady(true)
    media.addEventListener('change', syncSystem)
    window.addEventListener('storage', syncStorage)
    return () => {
      media.removeEventListener('change', syncSystem)
      window.removeEventListener('storage', syncStorage)
    }
  }, [])

  useEffect(() => {
    if (ready) {
      document.documentElement.dataset.stageTheme = theme
      document.documentElement.classList.toggle('dark', theme === 'night')
      useViewer.getState().setSceneTheme(theme === 'night' ? 'night' : 'studio')
    }
  }, [ready, theme])

  function choose(value: StageThemePreference) {
    setPreference(value)
    try {
      localStorage.setItem(STAGE_THEME_STORAGE_KEY, value)
    } catch {
      // A blocked preference store must not prevent changing this session's appearance.
    }
  }

  return <StageThemeContext value={{ preference, theme, choose }}>{children}</StageThemeContext>
}

export function StageThemeControl({ systemOnly = false }: { systemOnly?: boolean } = {}) {
  const { preference, theme, choose } = useContext(StageThemeContext)
  const day = theme === 'day'
  return (
    <div aria-label="界面明暗" className="stage-theme-control" role="group">
      {!systemOnly && (
        <button
          aria-label={day ? '切换到夜场' : '切换到日场'}
          onClick={() => choose(day ? 'night' : 'day')}
          title={day ? '当前日场，切换到夜场' : '当前夜场，切换到日场'}
          type="button"
        >
          {day ? <Sun aria-hidden="true" size={16} /> : <Moon aria-hidden="true" size={16} />}
          <span>{day ? '日场' : '夜场'}</span>
        </button>
      )}
      {systemOnly && (
        <button
          aria-label="跟随系统明暗"
          aria-pressed={preference === 'system'}
          onClick={() => choose(preference === 'system' ? theme : 'system')}
          title={preference === 'system' ? '正在跟随系统，点击固定当前明暗' : '跟随系统明暗'}
          type="button"
        >
          <Monitor aria-hidden="true" size={16} />
          跟随系统明暗
        </button>
      )}
    </div>
  )
}
