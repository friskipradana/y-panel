import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { runBrowserSpeedtest, runServerSpeedtest, type BrowserSpeedResult, type SpeedProgress } from '@/api/speedtest'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'

export type SpeedTab = 'browser' | 'server'

export interface HistoryItem extends BrowserSpeedResult {
  kind: SpeedTab
}

const HISTORY_KEY = 'reneo-speedtest-history'
const HISTORY_MAX = 8
const IDLE: SpeedProgress = { phase: 'idle', mbps: 0, fraction: 0 }

function loadHistory(): HistoryItem[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_MAX) : []
  } catch {
    return []
  }
}

function saveHistory(items: HistoryItem[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items))
  } catch {
    // history is a convenience; the test does not depend on it
  }
}

export function useSpeedtestWindow() {
  const { t } = useI18n()
  const isSuperadmin = useAuthStore((s) => s.user?.role) === 'superadmin'
  const [tab, setTab] = useState<SpeedTab>('browser')
  const [progress, setProgress] = useState<SpeedProgress>(IDLE)
  const [browserResult, setBrowserResult] = useState<BrowserSpeedResult | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory)
  const abortRef = useRef<AbortController | null>(null)

  const remember = useCallback((item: HistoryItem) => {
    setHistory((current) => {
      const next = [item, ...current].slice(0, HISTORY_MAX)
      saveHistory(next)
      return next
    })
  }, [])

  // a test must not keep running after the window is closed
  useEffect(() => () => abortRef.current?.abort(), [])

  const runningBrowser = progress.phase !== 'idle' && progress.phase !== 'done'

  const startBrowser = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBrowserResult(null)
    try {
      const result = await runBrowserSpeedtest(setProgress, controller.signal)
      setBrowserResult(result)
      remember({ kind: 'browser', ...result })
    } catch {
      if (!controller.signal.aborted) {
        setProgress(IDLE)
        alertLib.fire(t('speedtest.failedTitle'), t('speedtest.failedBrowser'), 'error')
      }
    }
  }, [remember, t])

  const stopBrowser = useCallback(() => {
    abortRef.current?.abort()
    setProgress(IDLE)
  }, [])

  const serverMutation = useMutation({
    mutationFn: () => runServerSpeedtest(),
    onSuccess: (result) => remember({ kind: 'server', ...result }),
    onError: (error: unknown) => {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('speedtest.failedServer')
      alertLib.fire(t('speedtest.failedTitle'), message, 'error')
    },
  })

  return {
    isSuperadmin,
    tab,
    setTab,
    progress,
    browserResult,
    runningBrowser,
    startBrowser,
    stopBrowser,
    serverMutation,
    history,
  }
}

export type SpeedtestWindowState = ReturnType<typeof useSpeedtestWindow>
