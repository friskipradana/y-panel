import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertCircle, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react'
import { getBootstrapStatus, loginAgent } from '@/api/agent'
import { runtimeLogger } from '@/lib/runtimeLogger'

interface Props {
  onLoginSuccess: () => void
}

export function LoginScreen({ onLoginSuccess }: Props) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')

  const bootstrapQuery = useQuery({
    queryKey: ['bootstrap-status'],
    queryFn: getBootstrapStatus,
    retry: 1,
    refetchInterval: 15_000,
  })

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

  const bootstrap = bootstrapQuery.data
  const statusText = bootstrapQuery.isError
    ? 'Agent belum merespons'
    : bootstrap?.hostname ?? 'Memuat agent...'

  return (
    <main className="login-page simple-login-page" id="panel-login-screen">
      <div className="login-shell absolute inset-0" />
      <div className="login-noise absolute inset-0 opacity-40" />

      <section className="simple-login-card glass-panel">
        <div className="simple-login-brand">
          <div className={`status-orb ${bootstrapQuery.isError ? 'status-orb--warn' : ''}`} />
          <span>{statusText}</span>
        </div>

        <div className="simple-login-header">
          <div className="simple-login-icon">
            <LockKeyhole size={22} />
          </div>
          <div>
            <p className="simple-login-kicker">Bootstrap access</p>
            <h1>Login ke UI Panel</h1>
            <p className="simple-login-copy">
              Masukkan username dan password bootstrap untuk mengakses kontrol server.
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

          {(loginMutation.isError || bootstrapQuery.isError) && (
            <div className="login-alert">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>
                {loginMutation.isError
                  ? 'Login gagal. Periksa kembali username dan password.'
                  : 'Agent belum merespons. Pastikan ui-panel service aktif.'}
              </span>
            </div>
          )}

          <button id="panel-login-submit" type="submit" className="auth-submit" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            <span>{loginMutation.isPending ? 'Signing in...' : 'Masuk'}</span>
          </button>
        </form>
      </section>
    </main>
  )
}
