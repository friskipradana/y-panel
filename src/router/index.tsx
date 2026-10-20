import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LandingPage } from '@/pages/LandingPage'
import { LoginPage } from '@/pages/LoginPage'
import { DesktopPage } from '@/pages/DesktopPage'
import { McpGuidePage } from '@/pages/McpGuidePage'
import { ArticlePage, ArticlesPage } from '@/pages/ArticlesPage'
import { InstallPage } from '@/pages/InstallPage'
import { LegalPage } from '@/pages/legal/LegalPage'
import { OrderInvoicePage } from '@/pages/OrderInvoicePage'
import { OrderPage } from '@/pages/OrderPage'
import { DatabaseAdminPage } from '@/pages/DatabaseAdminPage'
import { FrontendNotFoundPage } from '@/components/system/FrontendNotFoundPage'
import { useAuthStore } from '@/store/authStore'
import { usePublicSite } from '@/hooks/usePublicSite'

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
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path={LANDING_PATH}
          element={landing ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14, ease: [0.25, 1, 0.5, 1] }}
              className="w-full h-full overflow-y-auto"
            >
              <LandingPage authenticated={authenticated} onNavigate={(path) => navigate(path)} />
            </motion.div>
          ) : publicFallback}
        />
        <Route
          path="/docs/mcp"
          element={landing ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="w-full h-full overflow-y-auto"
            >
              <McpGuidePage />
            </motion.div>
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
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: [0.25, 1, 0.5, 1] }}
                className="absolute inset-0 z-[10000] overflow-hidden"
              >
                <LoginPage
                  onBack={landing ? () => navigate(LANDING_PATH) : undefined}
                  onLoginSuccess={handleLogin}
                />
              </motion.div>
            )
          }
        />
        <Route
          path={HOME_PATH}
          element={
            !authenticated ? (
              <Navigate to={LOGIN_PATH} replace />
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: [0.25, 1, 0.5, 1] }}
                className="absolute inset-0 z-0"
              >
                <DesktopPage onLogout={handleLogout} />
              </motion.div>
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
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[20000]"
            >
              <FrontendNotFoundPage authenticated={authenticated} />
            </motion.div>
          }
        />
      </Routes>
    </AnimatePresence>
  )
}
