import { useI18n } from '@/lib/i18n'

// Full-screen loading state shown while the session is checked. It matches the
// static splash in index.html so the hand-over from the page to React is invisible.
export function BootSplash({ message }: { message?: string }) {
  const { t } = useI18n()
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid min-h-dvh w-full place-items-center bg-[#0b2a57] px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white"
    >
      <div className="flex flex-col items-center gap-5 text-center">
        <img src="/favicon.svg" alt="" className="h-16 w-16 rounded-2xl shadow-lg" />
        <div className="space-y-1">
          <p className="text-lg font-bold tracking-tight">Reneo</p>
          <p className="text-[0.8125rem] text-white/70">{message ?? t('app.checkingSession')}</p>
        </div>
        <div className="boot-bar" aria-hidden="true" />
      </div>
    </div>
  )
}
