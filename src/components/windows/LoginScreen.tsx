// import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  // AlertCircle,
  LoaderCircle, ArrowRight, User, Eye, EyeOff
} from 'lucide-react'
import { getSetupStatus, initializeSetup, loginAgent } from '@/api/agent'
import { runtimeLogger } from '@/lib/runtimeLogger'
import { toast } from 'sonner'

interface Props {
  onLoginSuccess: () => void
}

type ScreenMode = 'login' | 'setup'

const pillStyle = {
  background: 'var(--login-panel-bg)',
  backdropFilter: 'blur(30px)',
} as const

export function LoginScreen({ onLoginSuccess }: Props) {
  const [mode, setMode] = useState<ScreenMode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [setupUsername, setSetupUsername] = useState('')
  const [setupEmail, setSetupEmail] = useState('')
  const [setupPassword, setSetupPassword] = useState('')
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('')
  const [setupDisplayName, setSetupDisplayName] = useState('')
  const [showSetupPassword, setShowSetupPassword] = useState(false)
  const [showSetupConfirmPassword, setShowSetupConfirmPassword] = useState(false)

  const setupStatusQuery = useQuery({
    queryKey: ['panel', 'setup-status'],
    queryFn: getSetupStatus,
    retry: 1,
  })

  useEffect(() => {
    if (setupStatusQuery.data) {
      setMode(setupStatusQuery.data.needsSetup ? 'setup' : 'login')
    }
  }, [setupStatusQuery.data])

  const loginMutation = useMutation({
    mutationFn: () => {
      runtimeLogger.info('auth', 'login requested', { username: username.trim() })
      return loginAgent(username.trim(), password)
    },
    onSuccess: (result) => {
      runtimeLogger.info('auth', 'login succeeded', result)
      setPassword('')
      onLoginSuccess()
    },
    onError: (error: any) => {
      runtimeLogger.error('auth', 'login failed', error)
      setPassword('')
      toast.error('Login gagal', {
        description: error?.response?.data?.error ?? 'Periksa kembali username dan password Anda.',
      })
    },
  })

  const setupMutation = useMutation({
    mutationFn: () => {
      runtimeLogger.info('auth', 'first-run setup requested', { username: setupUsername.trim() })
      return initializeSetup({
        username: setupUsername.trim(),
        email: setupEmail.trim(),
        password: setupPassword,
        confirmPassword: setupConfirmPassword,
        displayName: setupDisplayName.trim(),
      })
    },
    onSuccess: (result) => {
      runtimeLogger.info('auth', 'first-run setup succeeded', result)
      setSetupPassword('')
      setSetupConfirmPassword('')
      onLoginSuccess()
    },
    onError: (error) => {
      runtimeLogger.error('auth', 'first-run setup failed', error)
      setSetupPassword('')
      setSetupConfirmPassword('')
    },
  })

  // const activeError = (mode === 'setup' ? setupMutation.error : loginMutation.error) as Error | null
  const activePending = mode === 'setup' ? setupMutation.isPending : loginMutation.isPending

  const statusMessage = useMemo(() => {
    if (setupStatusQuery.isLoading) return 'Memeriksa status panel...'
    if (mode === 'setup') return 'Panel masih kosong. Buat admin utama untuk memulai.'
    return 'Masuk ke ypanel untuk melanjutkan.'
  }, [mode, setupStatusQuery.isLoading])

  return (
    <main className="mac-login-page" id="panel-login-screen">
      <div className="flex w-full max-w-sm flex-col items-center justify-center gap-1 pb-20 z-10">
        <div
          className="mb-4 flex h-24 w-24 items-center justify-center rounded-full border shadow-2xl login-avatar-shell"
          style={{
            background: 'var(--login-avatar-bg)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <User size={40} className="opacity-80 login-primary-icon" />
        </div>

        <div className="mb-3 text-center login-copy">
          <p className="text-sm font-medium">{mode === 'setup' ? 'First-run setup' : 'Welcome back'}</p>
          <p className="mt-1 text-xs login-copy-muted">{statusMessage}</p>
        </div>

        {setupStatusQuery.isLoading ? (
          <div className="mt-2 flex items-center gap-2 rounded-full border px-4 py-2 text-sm login-pill" style={pillStyle}>
            <LoaderCircle size={14} className="animate-spin" />
            <span>Memeriksa konfigurasi awal...</span>
          </div>
        ) : mode === 'setup' ? (
          <form
            className="w-72 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setupMutation.mutate()
            }}
          >
            <div className="relative overflow-hidden rounded-full border login-pill login-pill-shadow" style={pillStyle}>
              <input
                id="panel-setup-username"
                type="text"
                value={setupUsername}
                onChange={(e) => setSetupUsername(e.target.value)}
                className="w-full bg-transparent px-4 py-1.5 text-sm font-medium tracking-wide outline-none login-input"
                placeholder="Username"
                autoComplete="username"
              />
            </div>

            <div className="relative overflow-hidden rounded-full border login-pill login-pill-shadow" style={pillStyle}>
              <input
                id="panel-setup-display-name"
                type="text"
                value={setupDisplayName}
                onChange={(e) => setSetupDisplayName(e.target.value)}
                className="w-full bg-transparent px-4 py-1.5 text-sm font-medium tracking-wide outline-none login-input"
                placeholder="Nama tampilan"
                autoComplete="name"
              />
            </div>

            <div className="relative overflow-hidden rounded-full border login-pill login-pill-shadow" style={pillStyle}>
              <input
                id="panel-setup-email"
                type="email"
                value={setupEmail}
                onChange={(e) => setSetupEmail(e.target.value)}
                className="w-full bg-transparent px-4 py-1.5 text-sm font-medium tracking-wide outline-none login-input"
                placeholder="Email admin"
                autoComplete="email"
              />
            </div>

            <div className="relative flex items-center overflow-hidden rounded-full border login-pill login-pill-shadow" style={pillStyle}>
              <input
                id="panel-setup-password"
                type={showSetupPassword ? 'text' : 'password'}
                value={setupPassword}
                onChange={(e) => setSetupPassword(e.target.value)}
                className="w-full bg-transparent pl-4 pr-10 py-1.5 text-sm font-medium tracking-wider outline-none login-input"
                placeholder="Password"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-3 transition-colors login-icon-button"
                onClick={() => setShowSetupPassword(!showSetupPassword)}
                title={showSetupPassword ? 'Hide password' : 'Show password'}
              >
                {showSetupPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <div className="relative flex items-center overflow-hidden rounded-full border login-pill login-pill-shadow" style={pillStyle}>
              <input
                id="panel-setup-confirm-password"
                type={showSetupConfirmPassword ? 'text' : 'password'}
                value={setupConfirmPassword}
                onChange={(e) => setSetupConfirmPassword(e.target.value)}
                className="w-full bg-transparent pl-4 pr-10 py-1.5 text-sm font-medium tracking-wider outline-none login-input"
                placeholder="Konfirmasi password"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-3 transition-colors login-icon-button"
                onClick={() => setShowSetupConfirmPassword(!showSetupConfirmPassword)}
                title={showSetupConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showSetupConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <button
              id="panel-setup-submit"
              type="submit"
              className="mt-1 rounded-full border px-4 py-1.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-70 login-submit-wide login-pill-shadow"
              disabled={activePending}
            >
              {activePending ? 'Memproses...' : 'Buat admin & masuk'}
            </button>
          </form>
        ) : (
          <form
            className="w-56 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              loginMutation.mutate()
            }}
          >
            <div className="relative overflow-hidden rounded-full border login-pill login-pill-shadow" style={pillStyle}>
              <input
                id="panel-login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-transparent px-4 py-1.5 text-sm font-medium tracking-wide outline-none login-input"
                placeholder="Username"
                autoComplete="username"
              />
            </div>

            <div className="relative flex items-center overflow-hidden rounded-full border login-pill login-pill-shadow" style={pillStyle}>
              <input
                id="panel-login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent pl-4 pr-16 py-1.5 text-sm font-medium tracking-wider outline-none login-input"
                placeholder="Password"
                autoComplete="current-password"
                autoFocus
              />

              <button
                type="button"
                className="absolute right-8 transition-colors login-icon-button"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>

              <button
                id="panel-login-submit"
                type="submit"
                className="absolute right-1 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-all login-submit-round"
                disabled={activePending}
              >
                {activePending ? <LoaderCircle size={14} className="animate-spin" /> : <ArrowRight size={14} strokeWidth={2.5} />}
              </button>
            </div>
          </form>
        )}

        {/* <AnimatePresence mode="wait">
          {activeError && (
            <motion.div
              key={`${mode}-error`}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mt-4 flex items-center gap-2 rounded-xl border border-red-400/40 bg-red-500/20 px-4 py-2 shadow-lg backdrop-blur-md"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-200" />
              <span className="text-sm font-medium text-red-100">
                {activeError.message || (mode === 'setup' ? 'Setup admin pertama gagal.' : 'Login gagal. Coba lagi.')}
              </span>
            </motion.div>
          )}
        </AnimatePresence> */}
      </div>
    </main>
  )
}
