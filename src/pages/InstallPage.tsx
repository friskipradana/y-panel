import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PublicShell } from '@/components/public/PublicShell'
import { Button } from '@/components/ui/Button'
import { InstallGuide } from '@/pages/landing/InstallGuide'
import { usePageMeta } from '@/hooks/usePageMeta'
import { useI18n } from '@/lib/i18n'

const INSTALL_COMMAND = 'curl -fsSL https://install.reneo.my.id | sudo bash'

// Step by step installation, kept off the landing page and reached from "Options and full steps"
export function InstallPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  usePageMeta(`${t('landing.guide.title')} | Reneo`, t('landing.guide.subtitle'))

  return (
    <PublicShell>
      <main className="mx-auto max-w-5xl px-4 pb-10 pt-3 sm:px-6 sm:pt-8">
        <Button variant="ghost" className="-ml-2.5" onClick={() => navigate('/')}>
          <ArrowLeft size={13} />
          <span>{t('install.back')}</span>
        </Button>
        <InstallGuide installCommand={INSTALL_COMMAND} onNavigate={navigate} />
      </main>
    </PublicShell>
  )
}
