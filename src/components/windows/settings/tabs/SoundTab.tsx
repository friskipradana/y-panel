import { AudioLines, Bell, Lock, LockOpen, Volume2, VolumeX } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { soundManager } from "@/lib/sound";
import { useThemeStore } from "@/store/themeStore";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";

// The sounds the panel makes, each with an interactive card to audition it
const SAMPLES = [
  { key: "notification", icon: Bell, play: () => soundManager.playNotification() },
  { key: "lockChime", icon: Lock, play: () => soundManager.playLock() },
  { key: "unlockChime", icon: LockOpen, play: () => soundManager.playUnlock() },
] as const;

export function SoundTab() {
  const { t } = useI18n();
  const { soundEnabled, setSoundEnabled, soundVolume, setSoundVolume } = useThemeStore();

  return (
    <div className="space-y-3">
      {/* ── Single Unified Sound & Audio Card ── */}
      <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
        {/* ── Section 1: Master Enable Toggle ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Volume2 className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">
                {t("settings.sound.masterTitle")}
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                {t("settings.sound.masterSubtitle")}
              </p>
            </div>
          </div>
          <ToggleSwitch
            checked={soundEnabled}
            onChange={() => setSoundEnabled(!soundEnabled)}
            label={t("settings.sound.enableToggle")}
          />
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── Section 2: Volume Utama Slider ── */}
        <div className={`space-y-2 transition-opacity ${soundEnabled ? "" : "opacity-50 pointer-events-none"}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {soundEnabled && soundVolume > 0 ? (
                <Volume2 className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              ) : (
                <VolumeX className="h-4 w-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              )}
              <label htmlFor="settings-sound-volume" className="text-[12.5px] font-semibold text-[var(--win-text)]">
                {t("settings.sound.masterVolume")}
              </label>
            </div>
            <span className="panel-mono text-[12px] font-bold text-[var(--panel-primary-text)]">
              {Math.round(soundVolume * 100)}%
            </span>
          </div>
          <input
            id="settings-sound-volume"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={soundVolume}
            disabled={!soundEnabled}
            aria-valuetext={`${Math.round(soundVolume * 100)}%`}
            onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
            onPointerUp={() => soundManager.playNotification()}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[var(--panel-surface-strong)] accent-[var(--panel-primary-solid)] disabled:cursor-not-allowed"
          />
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── Section 3: Pratinjau & Diagnostik Suara ── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <AudioLines className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t("settings.sound.previewTitle")}</h2>
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">
              {soundEnabled ? t("settings.sound.previewSubtitle") : t("settings.sound.previewOff")}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {SAMPLES.map(({ key, icon: Icon, play }) => (
              <button
                key={key}
                type="button"
                disabled={!soundEnabled}
                onClick={play}
                className="group flex flex-col items-start gap-1 p-2.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)] hover:border-[var(--panel-primary-solid)]/40 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <span className="flex items-center gap-2 text-[12px] font-semibold text-[var(--win-text)] group-hover:text-[var(--panel-primary-text)] transition-colors">
                  <Icon size={14} className="text-[var(--panel-primary-text)] shrink-0" strokeWidth={1.75} />
                  {t(`settings.sound.${key}`)}
                </span>
                <span className="text-[10.5px] text-[var(--text-secondary)] leading-snug">
                  {t(`settings.sound.${key}Desc`)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
