import { Component, type ReactNode } from 'react'
import { translate, type Language } from '@/lib/i18n'

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
  const stored = window.localStorage.getItem('ypanel-language')
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
        <div
          className="flex flex-1 flex-col items-center justify-center gap-4 p-6"
          style={{ color: 'var(--win-text)' }}
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="text-4xl">⚠️</span>
            <h3 className="text-sm font-semibold opacity-90">{t('errorBoundary.windowError')}</h3>
            <p className="max-w-sm text-[12px] leading-relaxed opacity-60">
              {this.state.error?.message || t('errorBoundary.fallbackMessage')}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-lg px-4 py-2 text-[12px] font-medium transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: 'rgba(99,102,241,0.15)',
              color: 'rgb(129,140,248)',
              border: '1px solid rgba(99,102,241,0.25)',
            }}
          >
            {t('errorBoundary.retry')}
          </button>
        </div>
      )
    }

    return this.props.children
  }
}




