import { Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { LandingPage } from '@/pages/landing/LandingPage'
import { lazyNamed } from '@/lib/lazy'
import { FrontendNotFoundPage } from '@/components/system/FrontendNotFoundPage'
import { useAuthStore } from '@/store/authStore'
import { usePublicSite } from '@/hooks/usePublicSite'

const LoginPage = lazyNamed(() => import('@/pages/login/LoginPage'), 'LoginPage')
const DesktopPage = lazyNamed(() => import('@/pages/desktop/DesktopPage'), 'DesktopPage')
const McpGuidePage = lazyNamed(() => import('@/pages/mcp-guide/McpGuidePage'), 'McpGuidePage')
const ArticlesPage = lazyNamed(() => import('@/pages/articles/ArticlesPage'), 'ArticlesPage')
const ArticlePage = lazyNamed(() => import('@/pages/articles/ArticlesPage'), 'ArticlePage')
const InstallPage = lazyNamed(() => import('@/pages/install/InstallPage'), 'InstallPage')
const LegalPage = lazyNamed(() => import('@/pages/legal/LegalPage'), 'LegalPage')
const OrderInvoicePage = lazyNamed(() => import('@/pages/order/OrderInvoicePage'), 'OrderInvoicePage')
const OrderPage = lazyNamed(() => import('@/pages/order/OrderPage'), 'OrderPage')
const DatabaseAdminPage = lazyNamed(() => import('@/pages/database-admin/DatabaseAdminPage'), 'DatabaseAdminPage')

// The page of an address, fetched before the first frame of the app, so a reload does not flash an empty page while its code loads
export function preloadRoute(pathname: string): Promise<unknown> {
  if (pathname === LOGIN_PATH) return LoginPage.preload()
  if (pathname === HOME_PATH || pathname.startsWith(HOME_PATH + '/')) return DesktopPage.preload()
  if (pathname.startsWith('/database/')) return DatabaseAdminPage.preload()
  if (pathname === '/docs/mcp') return McpGuidePage.preload()
  if (pathname === '/install') return InstallPage.preload()
  if (pathname === '/terms' || pathname === '/privacy') return LegalPage.preload()
  if (/^\/order\/[^/]+\/invoice$/.test(pathname)) return OrderInvoicePage.preload()
  if (pathname === '/order' || pathname.startsWith('/order/')) return OrderPage.preload()
  if (pathname === '/articles') return ArticlesPage.preload()
  if (pathname.startsWith('/articles/')) return ArticlePage.preload()
  return Promise.resolve()
}

function PageFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 size={18} className="animate-spin text-[var(--text-secondary)]" />
    </div>
  )
}

export const LOGIN_PATH = import.meta.env.VITE_LOGIN_PATH || '/login'
export const HOME_PATH = '/home'
export const LANDING_PATH = '/'
export const MCP_GUIDE_PATH = '/docs/mcp'

export function AppRouter() {
  const location = useLocation()
  const navigate = useNavigate()
  const authenticated = useAuthStore((s) => s.authenticated)
  const loginSuccess = useAuthStore((s) => s.loginSuccess)
  const logout = useAuthStore((s) => s.logout)
  const { landing } = usePublicSite()
  const publicFallback = <Navigate to={authenticated ? HOME_PATH : LOGIN_PATH} replace />

  const handleLogin = async (userData?: { username: string; role?: string }) => {
    await loginSuccess(userData)
    // a page that sent the visitor to the login form (e.g. /database/3) is where they go back to
    const next = new URLSearchParams(location.search).get('next')
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith(LOGIN_PATH) ? next : HOME_PATH
    navigate(safeNext, { replace: true })
  }

  const handleLogout = async () => {
    await logout()
    navigate(LOGIN_PATH, { replace: true })
  }

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes location={location} key={location.pathname}>
        <Route
          path={LANDING_PATH}
          element={landing ? (
            <div className="w-full h-full overflow-y-auto">
              <LandingPage authenticated={authenticated} onNavigate={(path) => navigate(path)} />
            </div>
          ) : publicFallback}
        />
        <Route
          path="/docs/mcp"
          element={landing ? (
            <div className="w-full h-full overflow-y-auto">
              <McpGuidePage />
            </div>
          ) : publicFallback}
        />
        <Route path="/mcp/guide" element={<Navigate to="/docs/mcp" replace />} />
        <Route path="/install" element={landing ? (<div className="h-full w-full overflow-y-auto"><InstallPage /></div>) : publicFallback} />
        <Route path="/terms" element={landing ? (<div className="h-full w-full overflow-y-auto"><LegalPage kind="terms" /></div>) : publicFallback} />
        <Route path="/privacy" element={landing ? (<div className="h-full w-full overflow-y-auto"><LegalPage kind="privacy" /></div>) : publicFallback} />
        <Route path="/order" element={landing ? (<div className="h-full w-full overflow-y-auto"><OrderPage /></div>) : publicFallback} />
        <Route path="/order/:publicId" element={landing ? (<div className="h-full w-full overflow-y-auto"><OrderPage /></div>) : publicFallback} />
        <Route path="/order/:publicId/invoice" element={landing ? <OrderInvoicePage /> : publicFallback} />
        <Route path="/articles" element={landing ? (<div className="h-full w-full overflow-y-auto"><ArticlesPage /></div>) : publicFallback} />
        <Route path="/articles/:slug" element={landing ? (<div className="h-full w-full overflow-y-auto"><ArticlePage /></div>) : publicFallback} />
        <Route
          path={LOGIN_PATH}
          element={
            authenticated ? (
              <Navigate to={HOME_PATH} replace />
            ) : (
              <div
                className="absolute inset-0 z-[10000] overflow-hidden"
              >
                <LoginPage
                  onBack={landing ? () => navigate(LANDING_PATH) : undefined}
                  onLoginSuccess={handleLogin}
                />
              </div>
            )
          }
        />
        <Route
          path={HOME_PATH}
          element={
            !authenticated ? (
              <Navigate to={LOGIN_PATH} replace />
            ) : (
              <div
                className="absolute inset-0 z-0"
              >
                <DesktopPage onLogout={handleLogout} />
              </div>
            )
          }
        />
        <Route
          path="/database/:key"
          element={
            !authenticated ? (
              <Navigate to={`${LOGIN_PATH}?next=${encodeURIComponent(location.pathname)}`} replace />
            ) : (
              <div className="absolute inset-0 z-0">
                <DatabaseAdminPage />
              </div>
            )
          }
        />
        <Route
          path="*"
          element={
            <div className="absolute inset-0 z-[20000]">
              <FrontendNotFoundPage authenticated={authenticated} />
            </div>
          }
        />
      </Routes>
    </Suspense>
  )
}
