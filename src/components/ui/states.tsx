import type { ReactNode } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'

interface StateBase {
  className?: string
}

export function EmptyState({ icon, children, className = '' }: StateBase & { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={`panel-empty ${className}`.trim()}>
      {icon ? <span className="[&_svg]:h-8 [&_svg]:w-8 [&_svg]:stroke-[1.5]">{icon}</span> : null}
      <span>{children}</span>
    </div>
  )
}

export function LoadingState({ children, className = '' }: StateBase & { children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className={`panel-loading ${className}`.trim()}>
      <LoaderCircle className="h-4 w-4 animate-spin" />
      {children}
    </div>
  )
}

export function ErrorState({ title, hint, className = '' }: StateBase & { title: string; hint?: string }) {
  return (
    <div role="alert" className={`panel-error-state ${className}`.trim()}>
      <TriangleAlert className="h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        {hint ? <p className="mt-1 text-[12px] leading-6 opacity-90">{hint}</p> : null}
      </div>
    </div>
  )
}
