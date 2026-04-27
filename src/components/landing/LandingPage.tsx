import { ArrowRight, Boxes, Cloud, Database, FileTerminal, ShieldCheck, Sparkles } from 'lucide-react'

type LandingPageProps = {
  authenticated: boolean
  onNavigate: (path: string) => void
}

const HERO_IMAGE = '/ChatGPT%20Image%20Apr%2027%2C%202026%2C%2011_04_38%20AM.png'
const BRAND_IMAGE = '/ChatGPT%20Image%20Apr%2027%2C%202026%2C%2010_25_42%20AM.png'
const BANNER_IMAGE = '/ChatGPT%20Image%20Apr%2027%2C%202026%2C%2010_20_36%20AM.png'

const features = [
  {
    icon: Boxes,
    title: 'Docker Workspace',
    body: 'Kelola container, image, network, dan log runtime dari window desktop yang fokus.',
  },
  {
    icon: FileTerminal,
    title: 'Terminal & Files',
    body: 'Akses terminal host dan file manager dengan guard permission untuk operasional harian.',
  },
  {
    icon: Cloud,
    title: 'Cloudflare Tunnel',
    body: 'Publish service homeserver lebih rapi melalui tunnel dan DNS workflow terpadu.',
  },
  {
    icon: Database,
    title: 'Database & Logs',
    body: 'Pantau database, migrasi, service log, dan status agent dari satu control center.',
  },
]

export function LandingPage({ authenticated, onNavigate }: LandingPageProps) {
  const primaryPath = authenticated ? '/home' : '/login'

  return (
    <main className="landing-page-shell">
      <nav className="landing-nav" aria-label="Landing navigation">
        <button
          id="landing-brand-home"
          type="button"
          className="landing-brand"
          onClick={() => onNavigate('/')}
        >
          <img src="/favicon.svg" alt="YPanel" />
          <span>YPanel</span>
        </button>
        <div className="landing-nav-actions">
          <a id="landing-github-link" href="https://github.com/friskipradana/panel-desktop-ui" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <button
            id="landing-open-panel"
            type="button"
            className="landing-nav-cta"
            onClick={() => onNavigate(primaryPath)}
          >
            {authenticated ? 'Buka Dashboard' : 'Masuk Panel'}
          </button>
        </div>
      </nav>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
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
            <button
              id="landing-primary-cta"
              type="button"
              className="landing-primary-cta"
              onClick={() => onNavigate(primaryPath)}
            >
              {authenticated ? 'Masuk ke Home Dashboard' : 'Mulai Gunakan YPanel'}
              <ArrowRight size={18} />
            </button>
            <button
              id="landing-secondary-cta"
              type="button"
              className="landing-secondary-cta"
              onClick={() => onNavigate('/login')}
            >
              {authenticated ? 'Buka Dashboard' : 'Login Agent'}
            </button>
          </div>
          <div className="landing-trust-strip" aria-label="Project ownership">
            <span><strong>Owner</strong> Y_Corp</span>
            <span><strong>Contributors</strong> AknalRe · FriskiPradana</span>
          </div>
        </div>

        <div className="landing-hero-visual" aria-label="YPanel preview">
          <div className="landing-preview-card">
            <img src={HERO_IMAGE} alt="Preview tampilan YPanel" />
          </div>
          <div className="landing-floating-card landing-floating-card-top">
            <ShieldCheck size={18} />
            <span>Self-hosted runtime</span>
          </div>
          <div className="landing-floating-card landing-floating-card-bottom">
            <span className="landing-dot" />
            <span>Agent online</span>
          </div>
        </div>
      </section>

      <section className="landing-feature-grid" aria-label="Fitur unggulan YPanel">
        {features.map((feature) => {
          const Icon = feature.icon
          return (
            <article key={feature.title} className="landing-feature-card">
              <Icon size={22} />
              <h2>{feature.title}</h2>
              <p>{feature.body}</p>
            </article>
          )
        })}
      </section>

      <section className="landing-showcase" aria-label="Brand showcase">
        <div>
          <span className="landing-section-kicker">Built for practical operators</span>
          <h2>Satu panel untuk mengontrol workflow server harian.</h2>
          <p>
            Bukan dashboard generik. YPanel memakai mental model desktop: window,
            taskbar, dan workspace agar setiap operasi terasa familiar dan cepat.
          </p>
        </div>
        <div className="landing-showcase-images">
          <img src={BANNER_IMAGE} alt="YPanel logo banner" />
          <img src={BRAND_IMAGE} alt="YPanel brand identity" />
        </div>
      </section>
    </main>
  )
}
