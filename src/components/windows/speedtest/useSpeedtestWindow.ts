import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSpeedServers, IDLE_LIVE, runBrowserSpeedtest, runServerSpeedtest, type SpeedLive, type SpeedResult } from '@/api/speedtest'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'

export type SpeedTab = 'browser' | 'server'

export interface HistoryItem extends SpeedResult {
  kind: SpeedTab
}

export interface SpeedRunState {
  live: SpeedLive
  result: SpeedResult | null
  running: boolean
  start: () => void
  stop: () => void
}

const SERVER_KEY = 'reneo-speedtest-server'
const DEFAULT_SERVER = 'auto'
const HISTORY_KEY = 'reneo-speedtest-history'
const HISTORY_MAX = 8

function loadHistory(): HistoryItem[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_MAX) : []
  } catch {
    return []
  }
}

function loadServer(): string {
  try {
    return window.localStorage.getItem(SERVER_KEY) || DEFAULT_SERVER
  } catch {
    return DEFAULT_SERVER
  }
}

function saveHistory(items: HistoryItem[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items))
  } catch {
    // history is a convenience; the test does not depend on it
  }
}

// One test runner per tab: both stream into the same live model
function useRunner(
  kind: SpeedTab,
  run: (onLive: (live: SpeedLive) => void, signal: AbortSignal) => Promise<SpeedResult>,
  remember: (item: HistoryItem) => void,
  failure: string,
): SpeedRunState {
  const { t } = useI18n()
  const [live, setLive] = useState<SpeedLive>(IDLE_LIVE)
  const [result, setResult] = useState<SpeedResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // a test must not keep running after the window is closed
  useEffect(() => () => abortRef.current?.abort(), [])

  const running = live.phase !== 'idle' && live.phase !== 'done'

  const start = useCallback(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setResult(null)
    setLive({ ...IDLE_LIVE, phase: 'ping' })
    run(setLive, controller.signal)
      .then((done) => {
        setResult(done)
        remember({ kind, ...done })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLive(IDLE_LIVE)
        const message = error instanceof Error && error.message && !/^(Network|HTTP|Failed)/i.test(error.message) ? error.message : failure
        alertLib.fire(t('speedtest.failedTitle'), message, 'error')
      })
  }, [failure, kind, remember, run, t])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setLive(IDLE_LIVE)
  }, [])

  return { live, result, running, start, stop }
}

export function useSpeedtestWindow() {
  const { t } = useI18n()
  const isSuperadmin = useAuthStore((s) => s.user?.role) === 'superadmin'
  const [tab, setTab] = useState<SpeedTab>('browser')
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory)
  const [serverId, setServerIdState] = useState(loadServer)

  const servers = useQuery({ queryKey: ['speedtest-servers'], queryFn: getSpeedServers, enabled: isSuperadmin, staleTime: Infinity })
  const selected = servers.data?.find((item) => item.id === serverId) ?? servers.data?.[0] ?? null

  const setServerId = useCallback((id: string) => {
    setServerIdState(id)
    try {
      window.localStorage.setItem(SERVER_KEY, id)
    } catch {
      // the choice is only remembered for next time
    }
  }, [])

  const remember = useCallback((item: HistoryItem) => {
    setHistory((current) => {
      const next = [item, ...current].slice(0, HISTORY_MAX)
      saveHistory(next)
      return next
    })
  }, [])

  const browser = useRunner('browser', runBrowserSpeedtest, remember, t('speedtest.failedBrowser'))
  const runServer = useCallback((onLive: (live: SpeedLive) => void, signal: AbortSignal) => runServerSpeedtest(selected?.id ?? serverId, onLive, signal), [selected?.id, serverId])
  const server = useRunner('server', runServer, remember, t('speedtest.failedServer'))

  return { isSuperadmin, tab, setTab, browser, server, history, servers, selected, setServerId }
}

export type SpeedtestWindowState = ReturnType<typeof useSpeedtestWindow>
