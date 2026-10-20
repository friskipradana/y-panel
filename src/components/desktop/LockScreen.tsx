import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, LogOut } from 'lucide-react'
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
  const [showPassword, setShowPassword] = useState(false)
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
      className="fixed inset-0 z-[999999] flex flex-col items-center justify-center gap-8 p-6 select-none overflow-hidden text-white cursor-default"
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
              : 'bg-slate-950/60 backdrop-blur-xl'
        }`}
      />

      {/* Background Canvas for Animation Modes */}
      {(lockScreenStyle === 'matrix' || lockScreenStyle === 'starfield') && (
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-[2]" />
      )}

      {/* Clock: top of the screen when a password is needed, centred in screensaver mode */}
      {lockScreenStyle !== 'none' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative z-10 flex flex-col items-center text-center"
        >
          <div
            className={`font-light tabular-nums tracking-tight text-white ${
              requirePasswordOnWake ? 'text-5xl sm:text-6xl' : 'text-7xl sm:text-8xl md:text-9xl'
            }`}
            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          >
            {currentTime || '00:00:00'}
          </div>

          <p className={`text-slate-300 ${requirePasswordOnWake ? 'mt-1 text-[0.8125rem]' : 'mt-2 text-base sm:text-lg'}`}>
            {currentDate}
            <span aria-hidden="true"> · </span>
            {greeting}
          </p>
        </motion.div>
      )}

      {/* Sign-in, only when a password is needed: the password and what went wrong */}
      {requirePasswordOnWake && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="relative z-10 w-full max-w-[18rem]"
        >
          <form onSubmit={handleUnlock} className="space-y-2">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('lockscreen.passwordPlaceholder')}
                aria-label={t('lockscreen.passwordPlaceholder')}
                aria-invalid={error ? true : undefined}
                autoComplete="current-password"
                autoFocus
                className="h-10 w-full rounded-lg border border-white/20 bg-white/10 pl-3 pr-[4.75rem] text-sm text-white placeholder:text-slate-400 focus:border-white/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 max-md:text-base"
              />
              <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? t('ui.hidePassword') : t('ui.showPassword')}
                  title={showPassword ? t('ui.hidePassword') : t('ui.showPassword')}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white/60"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button
                  type="submit"
                  disabled={loading || !password.trim()}
                  aria-label={t('lockscreen.unlock')}
                  title={t('lockscreen.unlock')}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-[var(--panel-primary-solid)] text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-white/60"
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  role="alert"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5 text-[0.75rem] text-rose-300"
                >
                  <AlertCircle size={13} aria-hidden="true" />
                  <span>{error}</span>
                </motion.p>
              )}
            </AnimatePresence>
          </form>
        </motion.div>
      )}

      {/* Switch account under the form, or how to wake the screensaver at the foot of the screen */}
      <div className={requirePasswordOnWake ? 'relative z-10 -mt-4' : 'absolute inset-x-0 bottom-6 z-10 flex justify-center'}>
        {requirePasswordOnWake ? (
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white/60"
          >
            <LogOut size={14} aria-hidden="true" />
            <span>{t('lockscreen.changeAccountLogout')}</span>
          </button>
        ) : (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-[0.75rem] text-slate-300/80"
          >
            {wakeOnMouseMove ? t('lockscreen.wakeHint') : t('lockscreen.wakeHintNoMouse')}
          </motion.p>
        )}
      </div>
    </motion.div>
  )
}
