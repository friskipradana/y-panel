import { AudioLines, Bell, Lock, LockOpen, Volume2, VolumeX } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { soundManager } from "@/lib/sound";
import { useThemeStore } from "@/store/themeStore";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { SettingRow } from "@/components/ui/SettingRow";

// The sounds the panel makes, each with a button to hear it
const SAMPLES = [
  { key: "notification", icon: Bell, play: () => soundManager.playNotification() },
  { key: "lockChime", icon: Lock, play: () => soundManager.playLock() },
  { key: "unlockChime", icon: LockOpen, play: () => soundManager.playUnlock() },
] as const;

export function SoundTab() {
  const { t } = useI18n();
  const { soundEnabled, setSoundEnabled, soundVolume, setSoundVolume } = useThemeStore();

  return (
    <div className="space-y-3.5">
      <section className="panel-shell-card settings-card">
        <SectionHeader icon={<Volume2 />} title={t("settings.sound.masterTitle")} subtitle={t("settings.sound.masterSubtitle")} />

        <SettingRow
          title={t("settings.sound.enableToggle")}
          description={t("settings.sound.enableDesc")}
          icon={soundEnabled ? <Volume2 /> : <VolumeX />}
          tone="info"
          control={<ToggleSwitch checked={soundEnabled} onChange={() => setSoundEnabled(!soundEnabled)} label={t("settings.sound.enableToggle")} />}
        />

        <div className={`space-y-2 ${soundEnabled ? "" : "opacity-50"}`}>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="settings-sound-volume" className="text-[12.5px] font-semibold text-[var(--win-text)]">
              {t("settings.sound.masterVolume")}
            </label>
            <span className="panel-mono text-[12px] font-bold text-[var(--panel-primary-text)]">{Math.round(soundVolume * 100)}%</span>
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
            // letting go of the slider plays a sample at the new volume
            onPointerUp={() => soundManager.playNotification()}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[var(--panel-surface-strong)] accent-[var(--panel-primary-solid)] disabled:cursor-not-allowed"
          />
        </div>
      </section>

      <section className="panel-shell-card settings-card">
        <SectionHeader icon={<AudioLines />} title={t("settings.sound.previewTitle")} subtitle={soundEnabled ? t("settings.sound.previewSubtitle") : t("settings.sound.previewOff")} />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {SAMPLES.map(({ key, icon: Icon, play }) => (
            <Button key={key} variant="ghost" disabled={!soundEnabled} className="!h-auto flex-col !items-start gap-1 !p-3 text-left" onClick={play}>
              <span className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--win-text)]">
                <Icon size={14} className="text-[var(--panel-primary-text)]" />
                {t(`settings.sound.${key}`)}
              </span>
              <span className="whitespace-normal text-[11px] font-normal text-[var(--text-secondary)]">{t(`settings.sound.${key}Desc`)}</span>
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
