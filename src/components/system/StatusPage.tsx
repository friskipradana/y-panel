import './status-page.css'
import type { ReactNode } from 'react'
import { useI18n } from '@/lib/i18n'

type StatusPageProps = {
  code: string
  title: string
  description: string
  hint?: string
  eyebrow?: string
  badge?: string
  actions?: ReactNode
  showActions?: boolean
  details?: Array<{ label: string; value: string }>
}

export function StatusPage({
  code,
  title,
  description,
  hint,
  eyebrow = 'YPanel Experience',
  badge = 'Runtime Frontend',
  actions,
  showActions = true,
  details = [],
}: StatusPageProps) {
  const { t } = useI18n()

  return (
    <div className="status-page-shell login-shell">
      <div className="login-noise absolute inset-0 pointer-events-none" aria-hidden="true" />
      <main className="status-page-card glass-panel">
        <section className="status-page-main">
          <div className="status-page-badge">
            <span className="status-page-badge-dot" />
            {badge}
          </div>
          <p className="status-page-eyebrow">{eyebrow}</p>
          <div className="status-page-code">{code}</div>
          <h1 id="status-page-title" className="status-page-title">{title}</h1>
          <p className="status-page-description">{description}</p>

          {details.length > 0 ? (
            <div className="status-page-details" aria-label={t('status.detailsAria')}>
              {details.map((detail) => (
                <div key={detail.label} className="status-page-detail-card">
                  <span className="status-page-detail-label">{detail.label}</span>
                  <strong className="status-page-detail-value">{detail.value}</strong>
                </div>
              ))}
            </div>
          ) : null}

          {showActions && actions ? <div className="status-page-actions">{actions}</div> : null}
        </section>

        <aside className="status-page-side">
          <div className="status-page-tip-card">
            <span className="status-page-tip-label">{t('status.diagnosticHint')}</span>
            <p className="status-page-tip-copy">{hint || t('status.defaultHint')}</p>
          </div>

          <div className="status-page-side-list">
            <div className="status-page-side-item">
              <strong>{t('status.routeAppTitle')}</strong>
              <span>{t('status.routeAppDescription')}</span>
            </div>
            <div className="status-page-side-item">
              <strong>{t('status.runtimeBlockedTitle')}</strong>
              <span>{t('status.runtimeBlockedDescription')}</span>
            </div>
            <div className="status-page-side-item">
              <strong>{t('status.spaFriendlyTitle')}</strong>
              <span>{t('status.spaFriendlyDescription')}</span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}




