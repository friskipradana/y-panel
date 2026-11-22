import type { ReactNode } from 'react'
import { IconBadge, type UiTone } from './IconBadge'

export interface SettingRowProps {
  title: string
  description?: string
  /** Kontrol di kanan: ToggleSwitch, select, tombol */
  control: ReactNode
  icon?: ReactNode
  tone?: UiTone
  /** Konten tambahan di bawah baris (opsi turunan) */
  children?: ReactNode
  className?: string
}

// Baris pengaturan: [ikon] judul + deskripsi di kiri, kontrol di kanan
export function SettingRow({ title, description, control, icon, tone = 'neutral', children, className = '' }: SettingRowProps) {
  return (
    <div className={`setting-row flex flex-col gap-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3.5 ${className}`}>
      <div className="flex items-center justify-between gap-x-4 gap-y-2 mobile:flex-wrap">
        <div className="flex min-w-0 items-center gap-3 mobile:flex-1 mobile:basis-[12rem]">
          {icon ? <IconBadge tone={tone}>{icon}</IconBadge> : null}
          <div className="min-w-0">
            <div className="text-[13px] font-semibold leading-[18px] text-[var(--win-text)]">{title}</div>
            {description ? (
              <div className="text-[11.5px] leading-[16px] text-[var(--text-secondary)]">{description}</div>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 mobile:max-w-full">{control}</div>
      </div>
      {children}
    </div>
  )
}
