import { useState, useEffect, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Lock, LogOut, Loader2, AlertCircle } from 'lucide-react'
import { loginAgent } from '@/api/agent'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { soundManager } from '@/lib/sound'
import { formatDateTimeID } from '@/lib/datetime'

interface LockScreenProps {
  onLogout: () => void
}

export function LockScreen({ onLogout }: LockScreenProps) {
  const user = useAuthStore((s) => s.user)
  const setIsLocked = useThemeStore((s) => s.setIsLocked)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [time, setTime] = useState('')

  useEffect(() => {
    soundManager.playLock()
    const tick = () => setTime(formatDateTimeID(new Date()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const username = user?.username || 'admin'
  const displayName = user?.displayName || username

  const handleUnlock = async (e?: FormEvent) => {
    if (e) e.preventDefault()
    if (!password.trim() || loading) return

    setLoading(true)
    setError(null)
    try {
      await loginAgent(username, password)
      soundManager.playUnlock()
      setIsLocked(false)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Password salah')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
      animate={{ opacity: 1, backdropFilter: 'blur(30px)' }}
      exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[999999] flex flex-col items-center justify-between p-6 bg-slate-950/60 text-white select-none overflow-hidden"
    >
      {/* Top Bar: Time & Lock Status */}
      <div className="flex flex-col items-center gap-1.5 pt-12">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400 bg-white/5 border border-white/10 px-3 py-1 rounded-full backdrop-blur-md">
          <Lock size={12} className="text-amber-400" />
          <span>Desktop Locked</span>
        </div>
        <div className="text-5xl sm:text-6xl font-extralight tracking-tight text-white mt-4 font-mono drop-shadow-md">
          {time.split(',')[1]?.trim() || time}
        </div>
        <div className="text-sm font-medium text-slate-300 drop-shadow">
          {time.split(',')[0]}
        </div>
      </div>

      {/* Middle Card: User Avatar & Unlock Input */}
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-[340px] flex flex-col items-center gap-5 p-6 rounded-3xl bg-slate-900/70 border border-white/15 backdrop-blur-2xl shadow-2xl shadow-black/50"
      >
        <div className="relative">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg shadow-sky-500/30">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-emerald-500 border-2 border-slate-900 flex items-center justify-center shadow">
            <span className="h-2 w-2 rounded-full bg-white" />
          </div>
        </div>

        <div className="text-center">
          <div className="text-lg font-bold text-white">{displayName}</div>
          <div className="text-xs text-slate-400 font-mono mt-0.5 capitalize">
            {user?.role || 'Administrator'}
          </div>
        </div>

        <form onSubmit={handleUnlock} className="w-full space-y-3">
          <div className="relative">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password..."
              autoFocus
              className="w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 pr-12 text-sm text-white placeholder:text-slate-400 focus:border-sky-400 focus:bg-white/15 focus:outline-none transition-all shadow-inner"
            />
            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500 flex items-center justify-center text-white transition-all cursor-pointer shadow-md"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ArrowRight size={16} />
              )}
            </button>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-1.5 text-xs text-rose-400 font-medium px-1"
            >
              <AlertCircle size={13} />
              <span>{error}</span>
            </motion.div>
          )}
        </form>
      </motion.div>

      {/* Bottom Actions: Switch User / Logout */}
      <div className="pb-8">
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-2 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition-all cursor-pointer shadow-sm backdrop-blur-md"
        >
          <LogOut size={14} />
          <span>Switch Account / Logout</span>
        </button>
      </div>
    </motion.div>
  )
}
