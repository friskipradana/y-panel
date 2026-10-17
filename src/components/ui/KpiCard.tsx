import type { ReactNode } from 'react'

export interface KpiCardProps {
  icon?: ReactNode
  title: string
  value: ReactNode
  subtitle?: ReactNode
  /** 0-100; menampilkan persentase dan bar progres */
  percent?: number
}

export function KpiCard({ icon, title, value, subtitle, percent }: KpiCardProps) {
  return (
    <article className="panel-kpi-card">
      <div className="panel-kpi-card__header">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate text-[12px] font-semibold">{title}</span>
        </div>
        {percent !== undefined ? (
          <span className="text-[12px] font-bold text-[var(--panel-primary-text)]">{percent.toFixed(1)}%</span>
        ) : null}
      </div>
      <div className="panel-kpi-card__value">{value}</div>
      {subtitle ? <p className="panel-kpi-card__description">{subtitle}</p> : null}
      {percent !== undefined ? (
        <div className="panel-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
          <div className="panel-progress__bar" style={{ width: `${Math.min(percent, 100)}%` }} />
        </div>
      ) : null}
    </article>
  )
}
