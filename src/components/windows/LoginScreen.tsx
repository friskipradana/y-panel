import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react'
import { loginAgent } from '@/api/agent'
import { runtimeLogger } from '@/lib/runtimeLogger'

interface Props {
  onLoginSuccess: () => void
}

export function LoginScreen({ onLoginSuccess }: Props) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')

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
    onError: (error) => {
      runtimeLogger.error('auth', 'login failed', error)
    },
  })

  return (
    <main className="login-page simple-login-page" id="panel-login-screen">
      <div className="login-shell absolute inset-0" />
      <div className="login-noise absolute inset-0 opacity-40" />

      <section className="simple-login-card glass-panel">
        {/* <div className="simple-login-brand">
          <div className={`status-orb ${loginMutation.isError ? 'status-orb--warn' : ''}`} />
          <span>Secure admin access</span>
        </div> */}

        <div className="simple-login-header">
          <div className="simple-login-icon">
            <LockKeyhole size={22} />
          </div>
          <div>
            <p className="simple-login-kicker">Secure access</p>
            <h1>Login ke UI Panel</h1>
            <p className="simple-login-copy">
              Masukkan username dan password untuk mengakses kontrol server.
            </p>
          </div>
        </div>

        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault()
            loginMutation.mutate()
          }}
        >
          <label className="block">
            <span className="login-field-label">Username</span>
            <input
              id="panel-login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="auth-input"
              placeholder="admin"
              autoComplete="username"
            />
          </label>

          <label className="block">
            <span className="login-field-label">Password</span>
            <input
              id="panel-login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-input"
              placeholder="Masukkan password"
              autoComplete="current-password"
            />
          </label>

          <AnimatePresence mode="wait">
            {loginMutation.isError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="login-alert"
              >
                <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-400" />
                <span>Login gagal. Periksa kembali username dan password.</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button id="panel-login-submit" type="submit" className="auth-submit" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            <span>{loginMutation.isPending ? 'Signing in...' : 'Masuk'}</span>
          </button>
        </form>
      </section>
    </main>
  )
}
