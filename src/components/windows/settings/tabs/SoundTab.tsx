import { AudioLines, Lock, LockOpen, Volume2, VolumeX } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { soundManager } from "@/lib/sound";
import { useThemeStore } from "@/store/themeStore";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { SettingRow } from "@/components/ui/SettingRow";

export function SoundTab() {
  const { t } = useI18n();
  const {
    soundEnabled,
    setSoundEnabled,
    soundVolume,
    setSoundVolume,
  } = useThemeStore();

  return (
    <div className="space-y-4">
      {/* Sound Master Card */}
      <div className="panel-shell-card p-4.5 flex flex-col gap-4">
        <SectionHeader
          icon={<Volume2 />}
          title={t("settings.sound.masterTitle")}
          subtitle={t("settings.sound.masterSubtitle")}
        />

        <div className="space-y-3.5 max-w-[620px]">
          <SettingRow
            title={t("settings.sound.enableToggle")}
            description={t("settings.sound.enableDesc")}
            icon={soundEnabled ? <Volume2 /> : <VolumeX />}
            tone="info"
            control={<ToggleSwitch checked={soundEnabled} onChange={() => setSoundEnabled(!soundEnabled)} />}
          />

          {soundEnabled && (
            <div className="p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-[var(--win-text)]">
                  {t("settings.sound.masterVolume")}
                </span>
                <span className="panel-mono text-[12px] font-bold text-[var(--panel-primary-text)]">
                  {Math.round(soundVolume * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={soundVolume}
                  onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-700/30 rounded-lg appearance-none cursor-pointer accent-[var(--panel-primary-solid)]"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sound Trigger Testing Card */}
      {soundEnabled && (
        <div className="panel-shell-card p-4.5 flex flex-col gap-4">
          <SectionHeader
            icon={<AudioLines />}
            title={t("settings.sound.previewTitle")}
            subtitle={t("settings.sound.previewSubtitle")}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-[620px]">
            <button
              type="button"
              onClick={() => soundManager.playNotification()}
              className="p-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)] text-left flex flex-col gap-1 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--win-text)]">
                <Volume2 size={14} className="text-sky-400" />
                <span>{t("settings.sound.notification")}</span>
              </div>
              <span className="text-[11px] text-[var(--text-secondary)]">{t("settings.sound.notificationDesc")}</span>
            </button>

            <button
              type="button"
              onClick={() => soundManager.playLock()}
              className="p-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)] text-left flex flex-col gap-1 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--win-text)]">
                <Lock size={14} className="text-amber-400" />
                <span>{t("settings.sound.lockChime")}</span>
              </div>
              <span className="text-[11px] text-[var(--text-secondary)]">{t("settings.sound.lockChimeDesc")}</span>
            </button>

            <button
              type="button"
              onClick={() => soundManager.playUnlock()}
              className="p-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)] text-left flex flex-col gap-1 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--win-text)]">
                <LockOpen size={14} className="text-emerald-400" />
                <span>{t("settings.sound.unlockChime")}</span>
              </div>
              <span className="text-[11px] text-[var(--text-secondary)]">{t("settings.sound.unlockChimeDesc")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
