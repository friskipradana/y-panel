import type { ReactNode } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'

interface StateBase {
  className?: string
}

export function EmptyState({ icon, children, className = '' }: StateBase & { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={`panel-empty ${className}`.trim()}>
      {icon ? <span className="[&_svg]:h-5 [&_svg]:w-5 [&_svg]:stroke-[1.75] opacity-60">{icon}</span> : null}
      <span className="text-[12px]">{children}</span>
    </div>
  )
}

export function LoadingState({ children, className = '' }: StateBase & { children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className={`panel-loading ${className}`.trim()}>
      <LoaderCircle className="h-4 w-4 animate-spin" />
      <span className="text-[12px]">{children}</span>
    </div>
  )
}

export function ErrorState({ title, hint, action, className = '' }: StateBase & { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div role="alert" className={`panel-error-state ${className}`.trim()}>
      <TriangleAlert className="h-4 w-4 shrink-0 text-[var(--panel-danger-text)]" strokeWidth={1.75} />
      <div>
        <p className="font-semibold text-[12.5px]">{title}</p>
        {hint ? <p className="mt-0.5 text-[11px] leading-relaxed opacity-85">{hint}</p> : null}
        {action ? <div className="mt-2.5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  )
}
