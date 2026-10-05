// Lightweight Web Audio API Synthesizer for Desktop UI sounds (no external audio files needed)
import { useThemeStore } from '@/store/themeStore'

class SoundManager {
  private ctx: AudioContext | null = null

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
    return this.ctx
  }

  public playNotification() {
    const { soundEnabled, soundVolume } = useThemeStore.getState()
    if (!soundEnabled) return
    const ctx = this.getContext()
    if (!ctx) return

    try {
      const now = ctx.currentTime
      const vol = Math.max(0, Math.min(1, soundVolume))

      // Crisp double chime (587Hz -> 880Hz / D5 -> A5)
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()

      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(587.33, now)
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12)

      osc2.type = 'triangle'
      osc2.frequency.setValueAtTime(1174.66, now + 0.08)

      gain.gain.setValueAtTime(0.25 * vol, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)

      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(ctx.destination)

      osc1.start(now)
      osc2.start(now + 0.08)
      osc1.stop(now + 0.35)
      osc2.stop(now + 0.35)
    } catch {
      // AudioContext play prevented
    }
  }

  public playSuccess() {
    const { soundEnabled, soundVolume } = useThemeStore.getState()
    if (!soundEnabled) return
    const ctx = this.getContext()
    if (!ctx) return

    try {
      const now = ctx.currentTime
      const vol = Math.max(0, Math.min(1, soundVolume))

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(523.25, now) // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08) // E5
      osc.frequency.setValueAtTime(783.99, now + 0.16) // G5
      osc.frequency.setValueAtTime(1046.50, now + 0.24) // C6

      gain.gain.setValueAtTime(0.2 * vol, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

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
      const now = ctx.currentTime
      const vol = Math.max(0, Math.min(1, soundVolume))

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(440, now)
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.15)

      gain.gain.setValueAtTime(0.2 * vol, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)

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
      const now = ctx.currentTime
      const vol = Math.max(0, Math.min(1, soundVolume))

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(330, now)
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.16)

      gain.gain.setValueAtTime(0.25 * vol, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.22)
    } catch {}
  }
}

export const soundManager = new SoundManager()
