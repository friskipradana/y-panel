import { useNavigate, Navigate, useSearchParams } from 'react-router-dom'
import { KvmWindow } from '@/components/windows/KvmWindow'
import { useAuthStore } from '@/store/authStore'
import { usePageMeta } from '@/hooks/usePageMeta'
import { useI18n } from '@/lib/i18n'

export function KvmPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const accessToken = (searchParams.get('token') ?? '').trim()
  const role = useAuthStore((s) => s.user?.role)
  usePageMeta(`${t('kvm.title')} | Reneo`)

  if (role && role !== 'superadmin') {
    return <Navigate to="/home" replace />
  }

  const handleBack = () => {
    if (window.opener && window.history.length <= 1) {
      window.close()
    } else {
      navigate('/home')
    }
  }

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden bg-[var(--kvm-viewport-bg)]">
      <KvmWindow standalone accessToken={accessToken} onBack={handleBack} />
    </div>
  )
}

