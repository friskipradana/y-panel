import { useNavigate, useLocation } from 'react-router-dom'
import { StatusPage } from '@/components/system/StatusPage'
import { useI18n } from '@/lib/i18n'

const LOGIN_PATH = import.meta.env.VITE_LOGIN_PATH || '/login'
const HOME_PATH = '/home'

interface FrontendNotFoundPageProps {
  authenticated: boolean
}

export function FrontendNotFoundPage({ authenticated }: FrontendNotFoundPageProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const currentPath = `${location.pathname}${location.search}${location.hash}`

  return (
    <StatusPage
      code="404"
      title={t('app.notFoundTitle')}
      description={t('app.notFoundDescription')}
      hint={t('app.notFoundHint')}
      badge="Frontend Route"
      eyebrow="App-level status page"
      details={[
        { label: t('app.activeRoute'), value: currentPath },
        { label: t('app.shellMode'), value: 'Frontend-managed 404' },
      ]}
      actions={(
        <>
          <button
            id="status-page-back-home"
            type="button"
            className="status-page-action status-page-action-primary cursor-pointer"
            onClick={() => navigate(HOME_PATH)}
          >
            {t('app.backDashboard')}
          </button>
          {!authenticated ? (
            <button
              id="status-page-go-login"
              type="button"
              className="status-page-action status-page-action-secondary cursor-pointer"
              onClick={() => navigate(LOGIN_PATH)}
            >
              {t('app.openLogin')}
            </button>
          ) : null}
        </>
      )}
    />
  )
}
