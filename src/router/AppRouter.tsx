import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LandingPage } from '@/components/landing/LandingPage'
import { LoginScreen } from '@/components/windows/LoginScreen'
import { Desktop } from '@/components/desktop/Desktop'
import { FrontendNotFoundPage } from '@/components/system/FrontendNotFoundPage'
import { LOGIN_PATH, HOME_PATH, LANDING_PATH } from './paths'

interface AppRouterProps {
  authenticated: boolean
  onLoginSuccess: (userData?: { username: string; role?: string }) => void
  onLogout: () => void
}

export function AppRouter({ authenticated, onLoginSuccess, onLogout }: AppRouterProps) {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path={LANDING_PATH}
          element={
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
              className="w-full h-full overflow-y-auto"
            >
              <LandingPage authenticated={authenticated} onNavigate={(path) => navigate(path)} />
            </motion.div>
          }
        />
        <Route
          path={LOGIN_PATH}
          element={
            authenticated ? (
              <Navigate to={HOME_PATH} replace />
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
                className="absolute inset-0 z-[10000] overflow-hidden"
              >
                <LoginScreen
                  onBack={() => navigate(LANDING_PATH)}
                  onLoginSuccess={onLoginSuccess}
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
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
                className="absolute inset-0 z-0"
              >
                <Desktop onLogout={onLogout} authenticated={authenticated} />
              </motion.div>
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
