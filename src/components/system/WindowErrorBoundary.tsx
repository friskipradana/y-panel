import { Component, type ReactNode } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { translate, type Language } from '@/lib/i18n'
import { Button } from '@/components/ui/Button'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'id'
  const stored = window.localStorage.getItem('reneo-language')
  return stored === 'en' ? 'en' : 'id'
}

export class WindowErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[WindowErrorBoundary] caught error:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      const language = getStoredLanguage()
      const t = (key: string) => translate(language, key)

      return (
        <div className="flex flex-1 flex-col items-center justify-center min-h-full h-full w-full my-auto p-6 select-none">
          <div className="panel-shell-card max-w-md w-full !p-4 flex flex-col gap-3 border border-[var(--panel-danger-border)] bg-[var(--panel-surface)] shadow-lg">
            {/* Header: Danger Icon + Title */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TriangleAlert className="h-4 w-4 text-[var(--panel-danger-text)] shrink-0" strokeWidth={1.75} />
                <h3 className="text-[13px] font-semibold text-[var(--win-text)]">{t('errorBoundary.windowError')}</h3>
              </div>
              <span className="text-[10.5px] font-mono uppercase tracking-wider text-[var(--panel-danger-text)] bg-[var(--panel-danger-bg)] px-1.5 py-0.5 rounded border border-[var(--panel-danger-border)]">
                Error
              </span>
            </div>

            {/* Error Message Box */}
            <div className="w-full">
              <pre className="font-mono text-[11.5px] leading-relaxed text-[var(--panel-danger-text)] bg-[var(--panel-danger-bg)] p-2.5 rounded-md border border-[var(--panel-danger-border)] break-words whitespace-pre-wrap overflow-x-auto max-h-[140px]">
                {this.state.error?.message || t('errorBoundary.fallbackMessage')}
              </pre>
            </div>

            {/* Actions: Retry button */}
            <div className="flex justify-end pt-1">
              <Button
                variant="primary"
                size="sm"
                icon={<RefreshCw size={13} />}
                onClick={this.handleRetry}
              >
                {t('errorBoundary.retry')}
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}




