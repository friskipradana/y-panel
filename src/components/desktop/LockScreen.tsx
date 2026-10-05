import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Lock, LogOut, Loader2, AlertCircle, ShieldCheck } from 'lucide-react'
import { loginAgent } from '@/api/agent'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { soundManager } from '@/lib/sound'
import { useI18n } from '@/lib/i18n'

interface LockScreenProps {
  onLogout: () => void
}

export function LockScreen({ onLogout }: LockScreenProps) {
  const { t, language } = useI18n()
  const user = useAuthStore((s) => s.user)
  const setIsLocked = useThemeStore((s) => s.setIsLocked)
  const lockScreenStyle = useThemeStore((s) => s.lockScreenStyle)
  const requirePasswordOnWake = useThemeStore((s) => s.requirePasswordOnWake)
  const wakeOnMouseMove = useThemeStore((s) => s.wakeOnMouseMove)
  const { getBackgroundStyle, mode, wallpaper, wallpaperFit, customImageUrl } = useThemeStore()
  const backgroundStyle = useMemo(
    () => getBackgroundStyle(),
    [getBackgroundStyle, mode, wallpaper, wallpaperFit, customImageUrl],
  )
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState('')
  const [currentDate, setCurrentDate] = useState('')
  const [greeting, setGreeting] = useState('')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    soundManager.playLock()

    const updateClock = () => {
      const now = new Date()
      const hours = now.getHours()
      const mins = String(now.getMinutes()).padStart(2, '0')
      const secs = String(now.getSeconds()).padStart(2, '0')
      setCurrentTime(`${String(hours).padStart(2, '0')}:${mins}:${secs}`)

      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }
      setCurrentDate(now.toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US', options))

      if (hours >= 4 && hours < 11) {
        setGreeting(t('lockscreen.greetingMorning'))
      } else if (hours >= 11 && hours < 15) {
        setGreeting(t('lockscreen.greetingAfternoon'))
      } else if (hours >= 15 && hours < 18) {
        setGreeting(t('lockscreen.greetingEvening'))
      } else {
        setGreeting(t('lockscreen.greetingNight'))
      }
    }

    updateClock()
    const interval = setInterval(updateClock, 1000)
    return () => clearInterval(interval)
  }, [language, t])

  // Canvas animations for Matrix Rain and Starfield 3D
  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let w = (canvas.width = window.innerWidth)
    let h = (canvas.height = window.innerHeight)

    const handleResize = () => {
      if (!canvas) return
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    if (lockScreenStyle === 'matrix') {
      const chars = '0123456789ABCDEF0123456789アカサタナハマヤラワ'
      const fontSize = 15
      const cols = Math.floor(w / fontSize)
      const drops = Array(cols).fill(1)

      const drawMatrix = () => {
        ctx.fillStyle = 'rgba(10, 15, 26, 0.15)'
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#22c55e'
        ctx.font = `${fontSize}px monospace`

        for (let i = 0; i < drops.length; i++) {
          const text = chars.charAt(Math.floor(Math.random() * chars.length))
          ctx.fillText(text, i * fontSize, drops[i] * fontSize)

          if (drops[i] * fontSize > h && Math.random() > 0.975) {
            drops[i] = 0
          }
          drops[i]++
        }
        animId = requestAnimationFrame(drawMatrix)
      }
      drawMatrix()
    } else if (lockScreenStyle === 'starfield') {
      const numStars = 300
      const stars = Array.from({ length: numStars }, () => ({
        x: (Math.random() - 0.5) * w,
        y: (Math.random() - 0.5) * h,
        z: Math.random() * w,
      }))

      const drawStars = () => {
        ctx.fillStyle = '#060913'
        ctx.fillRect(0, 0, w, h)
        const cx = w / 2
        const cy = h / 2

        for (let i = 0; i < numStars; i++) {
          const star = stars[i]
          star.z -= 3
          if (star.z <= 0) {
            star.z = w
            star.x = (Math.random() - 0.5) * w
            star.y = (Math.random() - 0.5) * h
          }

          const k = 128 / star.z
          const px = star.x * k + cx
          const py = star.y * k + cy

          if (px >= 0 && px <= w && py >= 0 && py <= h) {
            const size = Math.max(1, (1 - star.z / w) * 3)
            const alpha = Math.max(0.2, (1 - star.z / w))
            ctx.fillStyle = `rgba(186, 230, 253, ${alpha})`
            ctx.beginPath()
            ctx.arc(px, py, size / 2, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        animId = requestAnimationFrame(drawStars)
      }
      drawStars()
    }

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
    }
  }, [lockScreenStyle])

  // When requirePasswordOnWake is false, moving mouse, typing, or clicking wakes and dismisses the lock screen instantly
  useEffect(() => {
    if (requirePasswordOnWake) return

    let lastX = -1
    let lastY = -1
    const threshold = 20 // 20px movement threshold to avoid accidental sensor noise
    const startTime = Date.now()

    const dismissScreensaver = () => {
      soundManager.playUnlock()
      setIsLocked(false)
    }

    const handleMouseMove = (e: MouseEvent) => {
      // 300ms grace period after lock screen mounts to prevent immediate dismissal on existing mouse movement
      if (Date.now() - startTime < 300) {
        lastX = e.clientX
        lastY = e.clientY
        return
      }

      if (lastX === -1 || lastY === -1) {
        lastX = e.clientX
        lastY = e.clientY
        return
      }

      const dx = Math.abs(e.clientX - lastX)
      const dy = Math.abs(e.clientY - lastY)
      if (dx > threshold || dy > threshold) {
        dismissScreensaver()
      }
    }

    const handleKeyDown = () => {
      dismissScreensaver()
    }

    const handlePointerDown = (e: PointerEvent | MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement
      // Ignore clicks on buttons (like logout) so they can fire their own handlers
      if (target?.closest?.('button')) return

      dismissScreensaver()
    }

    if (wakeOnMouseMove) {
      window.addEventListener('mousemove', handleMouseMove)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      if (wakeOnMouseMove) {
        window.removeEventListener('mousemove', handleMouseMove)
      }
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [requirePasswordOnWake, wakeOnMouseMove, setIsLocked])

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
      setError(err?.response?.data?.message || t('lockscreen.invalidPassword'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[999999] flex flex-col items-center justify-between p-6 select-none overflow-hidden text-white cursor-default"
    >
      {/* Dynamic wallpaper layer */}
      <div className="absolute inset-0 z-0" style={backgroundStyle} />

      {/* Backdrop overlay depending on style */}
      <div
        className={`absolute inset-0 z-[1] pointer-events-none ${
          lockScreenStyle === 'none'
            ? 'bg-black/95'
            : lockScreenStyle === 'matrix' || lockScreenStyle === 'starfield'
              ? 'bg-slate-950/80 backdrop-blur-md'
              : 'bg-slate-950/55 backdrop-blur-xl'
        }`}
      />

      {/* Background Canvas for Animation Modes */}
      {(lockScreenStyle === 'matrix' || lockScreenStyle === 'starfield') && (
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-[2]" />
      )}

      {/* Top Section / Center Clock in Screensaver Mode */}
      {lockScreenStyle !== 'none' && (
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className={`relative z-10 flex flex-col items-center gap-1 text-center ${
            requirePasswordOnWake ? 'pt-8' : 'my-auto'
          }`}
        >
          {/* Only show badge in password-protected locked mode */}
          {requirePasswordOnWake && (
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-300 bg-white/10 border border-white/15 px-3 py-1 rounded-full backdrop-blur-md shadow-sm">
              <Lock size={12} className="text-amber-400" />
              <span>{t('lockscreen.lockedBadge')}</span>
            </div>
          )}

          <div
            className={`font-extralight tracking-tight text-white font-mono drop-shadow-lg ${
              requirePasswordOnWake ? 'text-6xl sm:text-7xl mt-4' : 'text-7xl sm:text-8xl md:text-9xl'
            }`}
            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          >
            {currentTime || '00:00:00'}
          </div>

          <div className={`font-medium text-slate-200 drop-shadow ${
            requirePasswordOnWake ? 'text-sm mt-1' : 'text-base sm:text-lg mt-2'
          }`}>
            {currentDate}
          </div>

          <div className="text-xs text-slate-400 font-light mt-0.5">
            {greeting}, <span className="font-semibold text-slate-200">{displayName}</span>
          </div>
        </motion.div>
      )}

      {/* Spacer for 'none' style */}
      {lockScreenStyle === 'none' && <div className="pt-12" />}

      {/* Center Section: User Card & Unlock Form (ONLY in Password Protected Mode) */}
      {requirePasswordOnWake && (
        <motion.div
          initial={{ scale: 0.94, y: 15 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="relative z-10 w-full max-w-[350px] flex flex-col items-center gap-5 p-6 rounded-3xl bg-slate-900/80 border border-white/15 backdrop-blur-2xl shadow-2xl shadow-black/60"
        >
          <div className="relative">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-indigo-700 flex items-center justify-center text-3xl font-bold text-white shadow-xl shadow-sky-500/25">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-emerald-500 border-2 border-slate-900 flex items-center justify-center shadow">
              <span className="h-2 w-2 rounded-full bg-white" />
            </div>
          </div>

          <div className="text-center">
            <div className="text-lg font-bold text-white">{displayName}</div>
            <div className="text-xs text-slate-400 font-mono mt-0.5 capitalize flex items-center justify-center gap-1">
              <ShieldCheck size={13} className="text-sky-400" />
              <span>{user?.role || 'Administrator'}</span>
            </div>
          </div>

          <form onSubmit={handleUnlock} className="w-full space-y-3">
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('lockscreen.passwordPlaceholder')}
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

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5 text-xs text-rose-400 font-medium px-1"
                >
                  <AlertCircle size={13} />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </motion.div>
      )}

      {/* Bottom Section */}
      <div className="relative z-10 pb-6">
        {requirePasswordOnWake ? (
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-2 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition-all cursor-pointer shadow-sm backdrop-blur-md"
          >
            <LogOut size={14} />
            <span>{t('lockscreen.changeAccountLogout')}</span>
          </button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-2 text-[12px] font-medium text-slate-300/80 px-4 py-1.5 rounded-full bg-black/30 backdrop-blur-md border border-white/10 shadow-sm"
          >
            <span>
              {wakeOnMouseMove
                ? t('lockscreen.wakeHint')
                : t('lockscreen.wakeHintNoMouse')}
            </span>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
