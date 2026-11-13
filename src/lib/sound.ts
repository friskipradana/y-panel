// Lightweight Web Audio API Synthesizer for Desktop UI sounds (zero external audio files needed)
import { useThemeStore } from '@/store/themeStore'

class SoundManager {
  private ctx: AudioContext | null = null
  // The browser refuses audio until the page has been touched; no context is made (and no warning logged) before that
  private unlocked = false

  public unlock(): void {
    this.unlocked = true
  }

  private safeResume(ctx: AudioContext): void {
    if (ctx.state === 'suspended') {
      try {
        ctx.resume().catch(() => {
          // Ignore autoplay prevention rejection silently
        })
      } catch {
        // Ignore immediate sync errors
      }
    }
  }

  public init(): void {
    if (typeof window === 'undefined') return

    // Respect browser autoplay policy: only create AudioContext after user has actually interacted with the document
    const hasActiveGesture =
      typeof navigator !== 'undefined' && 'userActivation' in navigator
        ? navigator.userActivation.hasBeenActive
        : this.unlocked

    if (!hasActiveGesture) return

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx()
        } catch {
          return
        }
      }
    }
    if (this.ctx) {
      this.safeResume(this.ctx)
    }
  }

  private getContext(): AudioContext | null {
    const hasActiveGesture =
      typeof navigator !== 'undefined' && 'userActivation' in navigator
        ? navigator.userActivation.hasBeenActive
        : this.unlocked

    if (!hasActiveGesture) return null
    if (!this.ctx) {
      this.init()
    }
    return this.ctx
  }

  public playNotification() {
    const { soundEnabled, soundVolume } = useThemeStore.getState()
    if (!soundEnabled) return
    const ctx = this.getContext()
    if (!ctx) return

    try {
      this.safeResume(ctx)
      const now = ctx.currentTime
      const vol = Math.max(0, Math.min(1, soundVolume ?? 0.7))

      // Crisp dual bell chime (587Hz -> 880Hz / D5 -> A5)
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()

      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(587.33, now)
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12)

      osc2.type = 'triangle'
      osc2.frequency.setValueAtTime(1174.66, now + 0.08)

      gain.gain.setValueAtTime(0.3 * vol, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38)

      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(ctx.destination)

      osc1.start(now)
      osc2.start(now + 0.08)
      osc1.stop(now + 0.38)
      osc2.stop(now + 0.38)
    } catch {
      // AudioContext play prevented
    }
  }

  public playWindowOpen() {
    const { soundEnabled, soundVolume } = useThemeStore.getState()
    if (!soundEnabled) return
    const ctx = this.getContext()
    if (!ctx) return

    try {
      this.safeResume(ctx)
      const now = ctx.currentTime
      const vol = Math.max(0, Math.min(1, soundVolume ?? 0.7))

      // Crisp friendly rising chime (480Hz -> 720Hz)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(480, now)
      osc.frequency.exponentialRampToValueAtTime(720, now + 0.09)

      gain.gain.setValueAtTime(0.25 * vol, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.15)
    } catch {}
  }

  public playWindowClose() {
    const { soundEnabled, soundVolume } = useThemeStore.getState()
    if (!soundEnabled) return
    const ctx = this.getContext()
    if (!ctx) return

    try {
      this.safeResume(ctx)
      const now = ctx.currentTime
      const vol = Math.max(0, Math.min(1, soundVolume ?? 0.7))

      // Soft descending click/dismiss (680Hz -> 340Hz)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(680, now)
      osc.frequency.exponentialRampToValueAtTime(340, now + 0.08)

      gain.gain.setValueAtTime(0.22 * vol, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.12)
    } catch {}
  }

  public playWindowMinimize() {
    const { soundEnabled, soundVolume } = useThemeStore.getState()
    if (!soundEnabled) return
    const ctx = this.getContext()
    if (!ctx) return

    try {
      this.safeResume(ctx)
      const now = ctx.currentTime
      const vol = Math.max(0, Math.min(1, soundVolume ?? 0.7))

      // Gentle swoop (540Hz -> 270Hz)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(540, now)
      osc.frequency.exponentialRampToValueAtTime(270, now + 0.1)

      gain.gain.setValueAtTime(0.18 * vol, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.13)
    } catch {}
  }

  public playSuccess() {
    const { soundEnabled, soundVolume } = useThemeStore.getState()
    if (!soundEnabled) return
    const ctx = this.getContext()
    if (!ctx) return

    try {
      this.safeResume(ctx)
      const now = ctx.currentTime
      const vol = Math.max(0, Math.min(1, soundVolume ?? 0.7))

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(523.25, now)
      osc.frequency.setValueAtTime(659.25, now + 0.08)
      osc.frequency.setValueAtTime(783.99, now + 0.16)
      osc.frequency.setValueAtTime(1046.5, now + 0.24)

      gain.gain.setValueAtTime(0.25 * vol, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.45)
    } catch {}
  }

  public playLock() {
    const { soundEnabled, soundVolume } = useThemeStore.getState()
    if (!soundEnabled) return
    const ctx = this.getContext()
    if (!ctx) return

    try {
      this.safeResume(ctx)
      const now = ctx.currentTime
      const vol = Math.max(0, Math.min(1, soundVolume ?? 0.7))

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(440, now)
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.15)

      gain.gain.setValueAtTime(0.25 * vol, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.18)
    } catch {}
  }

  public playUnlock() {
    const { soundEnabled, soundVolume } = useThemeStore.getState()
    if (!soundEnabled) return
    const ctx = this.getContext()
    if (!ctx) return

    try {
      this.safeResume(ctx)
      const now = ctx.currentTime
      const vol = Math.max(0, Math.min(1, soundVolume ?? 0.7))

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(330, now)
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.16)

      gain.gain.setValueAtTime(0.3 * vol, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.22)
    } catch {}
  }
}

export const soundManager = new SoundManager()

// Auto-unlock audio context on first user pointer/key interaction
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    soundManager.unlock()
    const hasActiveGesture =
      !('userActivation' in navigator) || navigator.userActivation.hasBeenActive
    if (hasActiveGesture) {
      soundManager.init()
      window.removeEventListener('click', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      window.removeEventListener('touchend', unlockAudio)
    }
  }
  // Use click, keydown, touchend instead of pointerdown so Chrome has established userActivation
  window.addEventListener('click', unlockAudio, { passive: true })
  window.addEventListener('keydown', unlockAudio, { passive: true })
  window.addEventListener('touchend', unlockAudio, { passive: true })
}
