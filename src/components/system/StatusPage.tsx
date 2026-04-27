import './status-page.css'
import type { ReactNode } from 'react'

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
            <div className="status-page-details" aria-label="Status details">
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
            <span className="status-page-tip-label">Diagnostic hint</span>
            <p className="status-page-tip-copy">{hint || 'Periksa route aktif, status autentikasi, dan runtime frontend yang sedang dimuat sebelum melanjutkan.'}</p>
          </div>

          <div className="status-page-side-list">
            <div className="status-page-side-item">
              <strong>404 · Route aplikasi</strong>
              <span>Gunakan frontend page agar desain lebih mudah diubah tanpa menyentuh runtime backend.</span>
            </div>
            <div className="status-page-side-item">
              <strong>403 · Runtime blocked</strong>
              <span>Kasus host atau origin yang ditolak tetap butuh fallback backend karena React belum sempat dimuat.</span>
            </div>
            <div className="status-page-side-item">
              <strong>SPA-friendly</strong>
              <span>Halaman ini aman untuk route internal dan dapat dikembangkan menjadi library error state bersama.</span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}
