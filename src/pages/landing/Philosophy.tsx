import { useState } from 'react'
import { useI18n } from '@/lib/i18n'

const PARTS = [
  { id: 'rein', root: 'Re', meaning: 'Rein · Control', num: '01' },
  { id: 'neo', root: 'Neo', meaning: 'New · Modern', num: '02' },
  { id: 'rene', root: 'Rene o', meaning: 'Come here · Javanese', num: '03' },
] as const

// The name in three parts: Re, Neo and "rene o", each with its philosophy for the panel
export function Philosophy() {
  const { t } = useI18n()
  const [activePart, setActivePart] = useState<number | null>(null)

  return (
    <section className="mt-14" aria-labelledby="landing-philosophy">
      <h2 id="landing-philosophy" className="text-xl font-bold tracking-tight sm:text-2xl">
        {t('landing.philosophy.title')}
      </h2>
      <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{t('landing.philosophy.subtitle')}</p>
      <p className="panel-mono mt-1 text-[0.75rem] text-[var(--text-secondary)]">{t('landing.hero.name')}</p>

      {/* Syllable Formula Bar */}
      <div className="mt-4 flex flex-wrap items-center gap-2 panel-mono text-[0.8125rem]">
        <button
          type="button"
          onMouseEnter={() => setActivePart(0)}
          onMouseLeave={() => setActivePart(null)}
          className={`cursor-pointer rounded-lg border px-3 py-1 transition-all ${
            activePart === 0
              ? 'border-[var(--panel-primary-border)] bg-[var(--panel-primary-subtle)] font-bold text-[var(--panel-primary-text)] shadow-xs'
              : 'border-[var(--win-border)] bg-[var(--panel-surface)]/60 text-[var(--text-secondary)] hover:border-[var(--panel-border-focus)]'
          }`}
        >
          Re
        </button>
        <span className="font-bold text-[var(--text-muted)]">+</span>
        <button
          type="button"
          onMouseEnter={() => setActivePart(1)}
          onMouseLeave={() => setActivePart(null)}
          className={`cursor-pointer rounded-lg border px-3 py-1 transition-all ${
            activePart === 1
              ? 'border-[var(--panel-primary-border)] bg-[var(--panel-primary-subtle)] font-bold text-[var(--panel-primary-text)] shadow-xs'
              : 'border-[var(--win-border)] bg-[var(--panel-surface)]/60 text-[var(--text-secondary)] hover:border-[var(--panel-border-focus)]'
          }`}
        >
          Neo
        </button>
        <span className="font-bold text-[var(--text-muted)]">=</span>
        <button
          type="button"
          onMouseEnter={() => setActivePart(2)}
          onMouseLeave={() => setActivePart(null)}
          className={`cursor-pointer rounded-lg border px-3 py-1 transition-all ${
            activePart === 2
              ? 'border-[var(--panel-primary-border)] bg-[var(--panel-primary-subtle)] font-bold text-[var(--panel-primary-text)] shadow-xs'
              : 'border-[var(--win-border)] bg-[var(--panel-surface)]/60 text-[var(--text-secondary)] hover:border-[var(--panel-border-focus)]'
          }`}
        >
          Rene o
        </button>
      </div>

      {/* 3 Interactive Etymology Cards */}
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        {PARTS.map((part, idx) => {
          const isHovered = activePart === idx
          return (
            <div
              key={part.id}
              onMouseEnter={() => setActivePart(idx)}
              onMouseLeave={() => setActivePart(null)}
              className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all duration-200 cursor-default ${
                isHovered
                  ? 'border-[var(--panel-primary-border)] bg-[var(--panel-surface)]/70 shadow-sm'
                  : 'border-[var(--win-border)] bg-[var(--panel-surface)]/30 hover:border-[var(--panel-border-focus)]'
              }`}
            >
              <div>
                {/* Header: Number & Word Tag */}
                <div className="flex items-center justify-between">
                  <span className="panel-mono text-[0.75rem] font-bold text-[var(--text-muted)]">
                    {part.num}
                  </span>
                  <span className="panel-mono text-[0.75rem] font-medium text-[var(--panel-info-text)]">
                    {t(`landing.philosophy.${part.id}.tag`)}
                  </span>
                </div>

                {/* Title */}
                <h3 className="mt-3 text-[1rem] font-bold tracking-tight text-[var(--win-text)]">
                  {t(`landing.philosophy.${part.id}.title`)}
                </h3>

                {/* Description */}
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                  {t(`landing.philosophy.${part.id}.desc`)}
                </p>
              </div>

              {/* Bottom Footer Note */}
              <div className="mt-5 flex items-center justify-between border-t border-[var(--win-border)]/40 pt-3 text-[0.6875rem] panel-mono text-[var(--text-muted)]">
                <span>{part.meaning}</span>
                <span
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    isHovered ? 'bg-[var(--panel-primary-solid)]' : 'bg-[var(--win-border)]'
                  }`}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
