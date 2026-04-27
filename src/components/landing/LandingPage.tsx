import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle, CheckCircle2, Copy, Download, GitFork, ShieldCheck, Sparkles, Terminal } from 'lucide-react'

type LandingPageProps = {
  authenticated: boolean
  onNavigate: (path: string) => void
}

const HERO_IMAGE = '/ChatGPT%20Image%20Apr%2027%2C%202026%2C%2011_04_38%20AM.png'
const INSTALLER_URL = 'https://github.com/friskipradana/y-panel/releases/latest/download/ypanel-installer.run'
const INSTALL_COMMAND = `wget -O ypanel-installer.run ${INSTALLER_URL}
sudo bash ypanel-installer.run`

const highlights = ['Docker workspace', 'Terminal & files', 'Cloudflare tunnel', 'Users & logs']

export function LandingPage({ authenticated, onNavigate }: LandingPageProps) {
  const primaryPath = authenticated ? '/home' : '/login'
  const [installCopied, setInstallCopied] = useState(false)

  useEffect(() => {
    if (!installCopied) return
    const timeoutId = window.setTimeout(() => setInstallCopied(false), 2600)
    return () => window.clearTimeout(timeoutId)
  }, [installCopied])

  const copyInstallCommand = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND)
      setInstallCopied(true)
    } catch {
      window.prompt('Copy install command:', INSTALL_COMMAND)
    }
  }

  return (
    <main className="landing-page-shell landing-page-shell--single">
      <nav className="landing-nav landing-nav--single" aria-label="Landing navigation">
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
            <span>Desktop-style Linux server control panel</span>
          </div>
          <h1 id="landing-title">Control your server like a desktop.</h1>
          <p>
            YPanel menyatukan Docker, Projects, Terminal, Files, Cloudflare, Users,
            Database, dan Logs dalam workspace visual yang ringan untuk homeserver dan VPS.
          </p>

          <div className="landing-cta-row">
            <button id="landing-primary-cta" type="button" className="landing-primary-cta" onClick={() => onNavigate(primaryPath)}>
              {authenticated ? 'Buka Home Dashboard' : 'Login Agent'}
              <ArrowRight size={18} />
            </button>
            <a id="landing-installer-cta" className="landing-secondary-cta space-between" href={INSTALLER_URL}>
              <Download size={17} /> Download Installer
            </a>
          </div>

          <div className="landing-install-card" aria-label="Public install command">
            <div className="landing-install-card__header">
              <span><Terminal size={16} /> Public install</span>
              <button id="landing-copy-install-command" type="button" onClick={copyInstallCommand}>
                {installCopied ? <CheckCircle size={14} /> : <Copy size={14} />}
                {installCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre><code>{INSTALL_COMMAND}</code></pre>
          </div>

          <div className="landing-trust-strip" aria-label="Project ownership">
            <span><strong>Owner</strong> Y_Corp</span>
            <span><strong>Contributors</strong> AknalRe · FriskiPradana</span>
          </div>
        </div>

        <div className="landing-hero-visual landing-hero-visual--single" aria-label="YPanel preview">
          <div className="landing-preview-card landing-preview-card--single">
            <img src={HERO_IMAGE} alt="Preview tampilan YPanel" />
          </div>
          <div className="landing-feature-rail" aria-label="Fitur utama">
            {highlights.map((item) => (
              <span key={item}><CheckCircle2 size={15} /> {item}</span>
            ))}
          </div>
          <div className="landing-floating-card landing-floating-card-top">
            <ShieldCheck size={18} />
            <span>Self-hosted runtime</span>
          </div>
        </div>
      </section>

      <div className={`landing-copy-toast${installCopied ? ' landing-copy-toast--visible' : ''}`} role="status" aria-live="polite">
        <span><CheckCircle size={18} /></span>
        <div>
          <strong>Install command copied</strong>
          <small>Paste di terminal Linux lalu jalankan dengan sudo.</small>
        </div>
      </div>
    </main>
  )
}
