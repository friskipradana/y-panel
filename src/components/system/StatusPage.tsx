import './status-page.css'
import type { ReactNode } from 'react'
import { useI18n } from '@/lib/i18n'

type StatusPageProps = {
  code: string
  title: string
  description: string
  hint?: string
  actions?: ReactNode
  showActions?: boolean
  details?: Array<{ label: string; value: string }>
}

// One card: what happened, where, and what to do next. Follows the saved light/dark mode.
export function StatusPage({ code, title, description, hint, actions, showActions = true, details = [] }: StatusPageProps) {
  const { t } = useI18n()

  return (
    <div className="status-page-shell">
      <main className="status-page-card" aria-labelledby="status-page-title">
        <div className="status-page-brand">
          <img src="/favicon.svg" alt="" className="status-page-logo" />
          <span>Reneo</span>
        </div>

        <p className="status-page-code panel-mono">HTTP {code}</p>
        <h1 id="status-page-title" className="status-page-title">
          {title}
        </h1>
        <p className="status-page-description">{description}</p>

        {details.length > 0 ? (
          <dl className="status-page-details" aria-label={t('status.detailsAria')}>
            {details.map((detail) => (
              <div key={detail.label} className="status-page-detail">
                <dt>{detail.label}</dt>
                <dd className="panel-mono">{detail.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {hint ? <p className="status-page-hint">{hint}</p> : null}

        {showActions && actions ? <div className="status-page-actions">{actions}</div> : null}
      </main>
    </div>
  )
}
