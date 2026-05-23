import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle, CheckCircle2, Copy, Download, GitFork, ShieldCheck, Sparkles, Terminal } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

type LandingPageProps = {
  authenticated: boolean
  onNavigate: (path: string) => void
}

const HERO_IMAGE = '/ChatGPT%20Image%20Apr%2027%2C%202026%2C%2011_04_38%20AM.png'
const INSTALLER_URL = 'https://github.com/friskipradana/y-panel/releases/latest/download/ypanel-installer.run'
const INSTALL_COMMAND = `wget -O ypanel-installer.run ${INSTALLER_URL}
sudo bash ypanel-installer.run`

const highlights = [
  'landing.highlightDockerWorkspace',
  'landing.highlightTerminalFiles',
  'landing.highlightCloudflareTunnel',
  'landing.highlightUsersLogs',
]

export function LandingPage({ authenticated, onNavigate }: LandingPageProps) {
  const { t } = useI18n()
  const primaryPath = authenticated ? '/home' : '/login'
  const [installCopied, setInstallCopied] = useState(false)
  const [showCopyFallback, setShowCopyFallback] = useState(false)

  useEffect(() => {
    if (!installCopied) return
    const timeoutId = window.setTimeout(() => setInstallCopied(false), 2600)
    return () => window.clearTimeout(timeoutId)
  }, [installCopied])

  const copyInstallCommand = async () => {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(INSTALL_COMMAND)
        setShowCopyFallback(false)
        setInstallCopied(true)
        return
      } catch {
        // Fall through to the modern manual-copy panel below.
      }
    }

    setShowCopyFallback(true)
  }

  return (
    <main className="landing-page-shell landing-page-shell--single">
      <nav className="landing-nav landing-nav--single" aria-label={t('landing.navigationAria')}>
        <button id="landing-brand-home" type="button" className="landing-brand" onClick={() => onNavigate('/')}>
          <img src="/favicon.svg" alt="YPanel" />
          <span>YPanel</span>
        </button>
        <div className="landing-nav-actions">
          <a id="landing-github-link" href="https://github.com/friskipradana/y-panel" target="_blank" rel="noreferrer">
            <GitFork size={15} /> GitHub
          </a>
          <a id="landing-download-installer" className="landing-nav-cta" href={INSTALLER_URL}>
            <Download size={15} /> Installer
          </a>
        </div>
      </nav>

      <section className="landing-one-screen" aria-labelledby="landing-title">
        <div className="landing-hero-copy landing-hero-copy--single">
          <div className="landing-eyebrow">
            <Sparkles size={16} />
            <span>{t('landing.eyebrow')}</span>
          </div>
          <h1 id="landing-title">{t('landing.title')}</h1>
          <p>{t('landing.description')}</p>

          <div className="landing-cta-row">
            <button id="landing-primary-cta" type="button" className="landing-primary-cta" onClick={() => onNavigate(primaryPath)}>
              {authenticated ? t('landing.openDashboard') : t('landing.loginAgent')}
              <ArrowRight size={18} />
            </button>
            <a id="landing-installer-cta" className="landing-secondary-cta space-between" href={INSTALLER_URL}>
              <Download size={17} /> {t('landing.downloadInstaller')}
            </a>
          </div>

          <div className="landing-install-card" aria-label={t('landing.publicInstallCommand')}>
            <div className="landing-install-card__header">
              <span><Terminal size={16} /> {t('landing.publicInstall')}</span>
              <button id="landing-copy-install-command" type="button" onClick={copyInstallCommand}>
                {installCopied ? <CheckCircle size={14} /> : <Copy size={14} />}
                {installCopied ? t('landing.copied') : t('landing.copy')}
              </button>
            </div>
            <pre><code>{INSTALL_COMMAND}</code></pre>
          </div>

          <div className="landing-trust-strip" aria-label={t('landing.projectOwnership')}>
            <span><strong>{t('landing.owner')}</strong> Y_Corp</span>
            <span><strong>{t('landing.contributors')}</strong> AknalRe · FriskiPradana</span>
          </div>
        </div>

        <div className="landing-hero-visual landing-hero-visual--single" aria-label={t('landing.previewAria')}>
          <div className="landing-preview-card landing-preview-card--single">
            <img src={HERO_IMAGE} alt={t('landing.previewAlt')} />
          </div>
          <div className="landing-feature-rail" aria-label={t('landing.mainFeatures')}>
            {highlights.map((item) => (
              <span key={item}><CheckCircle2 size={15} /> {t(item)}</span>
            ))}
          </div>
          <div className="landing-floating-card landing-floating-card-top">
            <ShieldCheck size={18} />
            <span>{t('landing.selfHostedRuntime')}</span>
          </div>
        </div>
      </section>

      <div className={`landing-copy-toast${installCopied ? ' landing-copy-toast--visible' : ''}`} role="status" aria-live="polite">
        <span><CheckCircle size={18} /></span>
        <div>
          <strong>{t('landing.installCommandCopied')}</strong>
          <small>{t('landing.pasteTerminal')}</small>
        </div>
      </div>

      {showCopyFallback ? (
        <div className="landing-copy-fallback" role="dialog" aria-modal="true" aria-labelledby="landing-copy-fallback-title">
          <div className="landing-copy-fallback__panel">
            <div className="landing-copy-fallback__header">
              <span><Terminal size={16} /></span>
              <div>
                <strong id="landing-copy-fallback-title">{t('landing.copyInstallCommand')}</strong>
                <small>{t('landing.clipboardBlocked')}</small>
              </div>
            </div>
            <textarea id="landing-copy-fallback-command" readOnly value={INSTALL_COMMAND} onFocus={(event) => event.currentTarget.select()} autoFocus />
            <div className="landing-copy-fallback__actions">
              <button type="button" onClick={() => setShowCopyFallback(false)}>{t('common.close')}</button>
              <button type="button" onClick={() => {
                const field = document.getElementById('landing-copy-fallback-command') as HTMLTextAreaElement | null
                field?.select()
                document.execCommand('copy')
                setShowCopyFallback(false)
                setInstallCopied(true)
              }}>
                <CheckCircle size={15} /> {t('landing.manualCopy')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}




