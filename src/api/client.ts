import axios, { AxiosError } from 'axios'
import type { PaginationParams } from '@/types'
import { runtimeLogger } from '@/lib/runtimeLogger'
import { toast } from 'sonner'
import { isPublicRoute } from '@/lib/publicPaths'
import { translateNow } from '@/lib/i18n'
import { localizeServerMessage } from '@/lib/serverMessages'

export const agentApi = axios.create({
  baseURL: import.meta.env.VITE_AGENT_BASE,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

let unauthorizedEventArmed = true

agentApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // a request the caller aborted on purpose (end of a speed test phase) is not a failure
    if (axios.isCancel(error)) return Promise.reject(error)

    // the agent answers in English: the messages people run into read in the language of the page
    const data = error.response?.data as { error?: unknown } | undefined
    if (data && typeof data === 'object') {
      const localized = localizeServerMessage(data.error)
      if (localized) data.error = localized
    }

    const isPublicPath = isPublicRoute(window.location.pathname)
    const isUnauthorized = error.response?.status === 401
    const isRevisionCheck = error.config?.url?.includes('/api/v1/frontend/revision')
    const isStatsWS = error.config?.url?.includes('/api/v1/system/stats/ws')

    if (!isUnauthorized || (!isPublicPath && !isRevisionCheck && !isStatsWS)) {
      runtimeLogger.error('api', 'request failed', {
        method: error.config?.method,
        url: error.config?.url,
        status: error.response?.status,
        message: error.message,
      })
    }

    if (!error.response) {
      toast.error(translateNow('server.unreachable'), {
        description: translateNow('server.unreachableHint'),
      })
    }

    if (isUnauthorized && unauthorizedEventArmed) {
      unauthorizedEventArmed = false

      if (!isPublicPath) {
        runtimeLogger.warn('auth', 'session expired event dispatched')
        window.dispatchEvent(new CustomEvent('panel:session-expired'))
      }

      window.setTimeout(() => {
        unauthorizedEventArmed = true
      }, 250)
    }

    return Promise.reject(error)
  },
)

export const withPagination = (params?: PaginationParams) => ({
  params: {
    q: params?.q ?? '',
    limit: params?.limit,
    offset: params?.offset,
  },
})

export async function copyTextToClipboard(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return true
  }

  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()

    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)

    if (copied) return true
  }

  throw new Error('Clipboard API tidak tersedia')
}
