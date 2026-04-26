import { Clock3 } from 'lucide-react'
import { formatDateTimeID, type DateTimeInput } from '@/lib/datetime'

export function DateTimeText({ value, fallback = '-', className, withIcon = false }: { value: DateTimeInput; fallback?: string; className?: string; withIcon?: boolean }) {
  return (
    <span className={className} title={typeof value === 'string' ? value : undefined}>
      {withIcon ? <Clock3 className="h-3 w-3" /> : null}
      {formatDateTimeID(value, fallback)}
    </span>
  )
}
