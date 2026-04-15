import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, LoaderCircle, ArrowRight, User, Eye, EyeOff } from 'lucide-react'
import { loginAgent } from '@/api/agent'
import { runtimeLogger } from '@/lib/runtimeLogger'

interface Props {
  onLoginSuccess: () => void
}

export function LoginScreen({ onLoginSuccess }: Props) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

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
      setPassword('')
    },
  })

  return (
    <main className="mac-login-page" id="panel-login-screen">
      <div className="flex flex-col items-center justify-center gap-1 w-full max-w-sm mb-20 z-10">
        
        {/* Avatar */}
        <div className="w-24 h-24 rounded-full border border-white/10 shadow-2xl flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.4), rgba(59, 130, 246, 0.4))', backdropFilter: 'blur(20px)' }}>
          <User size={40} className="text-white opacity-80" />
        </div>

        {/* macOS 'Other User' style form */}
        <form
          className="w-56 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            loginMutation.mutate()
          }}
        >
          <div className="relative rounded-full overflow-hidden border border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.2)]" style={{ background: 'rgba(255, 255, 255, 0.14)', backdropFilter: 'blur(30px)' }}>
            <input
              id="panel-login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-transparent px-4 py-1.5 text-white/90 placeholder-white/50 outline-none text-sm font-medium tracking-wide"
              placeholder="Username"
              autoComplete="username"
            />
          </div>

          <div className="relative rounded-full overflow-hidden border border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.2)] flex items-center" style={{ background: 'rgba(255, 255, 255, 0.14)', backdropFilter: 'blur(30px)' }}>
            <input
              id="panel-login-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent pl-4 pr-16 py-1.5 text-white/90 placeholder-white/50 outline-none text-sm font-medium tracking-wider"
              placeholder="Password"
              autoComplete="current-password"
              autoFocus
            />
            
            <button
              type="button"
              className="absolute right-8 text-white/60 hover:text-white/90 transition-colors"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>

            <button 
              id="panel-login-submit" 
              type="submit" 
              className="absolute right-1 w-6 h-6 rounded-full flex items-center justify-center transition-all bg-white/20 hover:bg-white/40 text-white shadow-sm border border-white/20"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? <LoaderCircle size={14} className="animate-spin text-white" /> : <ArrowRight size={14} strokeWidth={2.5} />}
            </button>
          </div>
        </form>

        <AnimatePresence mode="wait">
          {loginMutation.isError && (
            <motion.div
              key="login-error"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mt-4 px-4 py-2 rounded-xl border border-red-400/40 bg-red-500/20 backdrop-blur-md shadow-lg flex items-center gap-2"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-200" />
              <span className="text-sm font-medium text-red-100">Login gagal. Coba lagi.</span>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </main>
  )
}
