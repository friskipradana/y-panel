import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMyPlan } from '@/api/hosting'
import { alertLib } from '@/lib/alert'
import { formatDateID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'
import { planNotice } from '@/lib/planNotice'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { useWindowStore } from '@/store/windowStore'

// Once a day per kind of notice, when the desktop is open: the plan ends soon, is in its grace period, or has ended.
// "Renew" opens the Profile window, where the plan can be renewed. Accounts without a plan get nothing.
export function PlanExpiryNotice() {
  const { t } = useI18n()
  const username = useAuthStore((s) => s.user?.username)
  const locked = useThemeStore((s) => s.isLocked)
  const openWindow = useWindowStore((s) => s.openWindow)
  const { data } = useQuery({ queryKey: ['me-plan'], queryFn: getMyPlan, retry: 0, staleTime: 5 * 60_000 })
  const asked = useRef(false)

  useEffect(() => {
    const notice = planNotice(data)
    if (!notice || !data?.plan || !username || locked || asked.current) return
    // today's date in the buyer's own calendar; a changed kind (expiring, then grace) speaks again the same day
    const mark = `${new Date().toLocaleDateString('en-CA')}|${notice.kind}`
    const storageKey = `reneo-plan-notice:${username}`
    try {
      if (window.localStorage.getItem(storageKey) === mark) return
      window.localStorage.setItem(storageKey, mark)
    } catch {
      // without storage it asks once per visit
    }
    asked.current = true

    const params = {
      plan: data.plan.name,
      date: formatDateID(notice.end),
      until: formatDateID(notice.graceEnd),
      days: notice.days,
    }
    void alertLib
      .confirm(t(`plan.notice.${notice.kind}.title`), t(`plan.notice.${notice.kind}.body`, params), t('plan.notice.renew'), t('plan.notice.later'), 'question')
      .then((renew) => {
        if (renew) openWindow('profile')
      })
  }, [data, username, locked, openWindow, t])

  return null
}
