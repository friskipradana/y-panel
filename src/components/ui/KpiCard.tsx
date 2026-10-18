import type { ReactNode } from 'react'

export interface KpiCardProps {
  icon?: ReactNode
  title: string
  value: ReactNode
  subtitle?: ReactNode
  /** 0-100; menampilkan persentase dan bar progres */
  percent?: number
}

// How full the meter is: from 75% it warns, from 90% it is critical
function usageLevel(percent: number): 'ok' | 'warn' | 'crit' {
  return percent >= 90 ? 'crit' : percent >= 75 ? 'warn' : 'ok'
}

export function KpiCard({ icon, title, value, subtitle, percent }: KpiCardProps) {
  const level = percent !== undefined ? usageLevel(percent) : 'ok'
  return (
    <article className="panel-kpi-card" data-level={level}>
      <div className="panel-kpi-card__header">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate text-[12px] font-semibold">{title}</span>
        </div>
        {percent !== undefined ? (
          <span className="panel-kpi-card__percent text-[12px] font-bold">{percent.toFixed(1)}%</span>
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
