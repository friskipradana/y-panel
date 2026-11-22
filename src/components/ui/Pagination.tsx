import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'
import { useI18n } from '@/lib/i18n'

export interface PaginationProps {
  page: number
  totalPages: number
  onChange: (page: number) => void
  className?: string
}

// Navigasi halaman sebelumnya/berikutnya; tidak dirender bila hanya satu halaman
export function Pagination({ page, totalPages, onChange, className = '' }: PaginationProps) {
  const { t } = useI18n()
  if (totalPages <= 1) return null
  return (
    <nav aria-label={t('common.pagination')} className={`panel-pagination ${className}`.trim()}>
      <Button
        type="button"
        variant="ghost"
        disabled={page <= 1}
        onClick={() => onChange(Math.max(1, page - 1))}
        icon={<ChevronLeft className="h-3.5 w-3.5" />}
      >
        {t('common.prev')}
      </Button>
      <span className="text-[12px] font-medium text-[var(--text-secondary)]">{t('common.pageOf', { page, total: totalPages })}</span>
      <Button type="button" variant="ghost" disabled={page >= totalPages} onClick={() => onChange(Math.min(totalPages, page + 1))}>
        {t('common.next')}
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </nav>
  )
}
