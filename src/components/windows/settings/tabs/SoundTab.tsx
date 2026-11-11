import { Bell, Lock, LockOpen, Play, Volume2, VolumeX } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { soundManager } from "@/lib/sound";
import { useThemeStore } from "@/store/themeStore";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { SettingRow } from "@/components/ui/SettingRow";
import { Button } from "@/components/ui/Button";
import { SettingsGroup } from "../SettingsPrimitives";

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
    <div className="space-y-4">
      {/* ── 1. Output Volume & Master Control Group ── */}
      <SettingsGroup
        title={t("settings.sound.masterTitle")}
        description={t("settings.sound.masterSubtitle")}
      >
        <div className="flex flex-col">
          {/* Master Enable Row */}
          <SettingRow
            title={t("settings.sound.enableToggle")}
            description={soundEnabled ? t("settings.sound.masterSubtitle") : t("settings.sound.previewOff")}
            icon={<Volume2 className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />}
            control={
              <ToggleSwitch
                checked={soundEnabled}
                onChange={() => setSoundEnabled(!soundEnabled)}
                label={t("settings.sound.enableToggle")}
              />
            }
          />

          {/* Volume Slider Row (GNOME Style) */}
          <SettingRow
            title={t("settings.sound.masterVolume")}
            description={`${Math.round(soundVolume * 100)}%`}
            icon={
              soundEnabled && soundVolume > 0 ? (
                <Volume2 className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              ) : (
                <VolumeX className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.75} />
              )
            }
            className={soundEnabled ? "" : "opacity-50 pointer-events-none"}
            control={
              <div className="flex items-center gap-3 w-48 sm:w-64">
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
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-[var(--panel-surface-strong)] accent-[var(--panel-primary-text)] disabled:cursor-not-allowed"
                />
                <span className="panel-mono text-[12px] font-bold text-[var(--panel-primary-text)] w-10 text-right">
                  {Math.round(soundVolume * 100)}%
                </span>
              </div>
            }
          />
        </div>
      </SettingsGroup>

      {/* ── 2. Alert Sounds & Sound Effects Group ── */}
      <SettingsGroup
        title={t("settings.sound.previewTitle")}
        description={soundEnabled ? t("settings.sound.previewSubtitle") : t("settings.sound.previewOff")}
      >
        <div className="flex flex-col">
          {SAMPLES.map(({ key, icon: Icon, play }) => (
            <SettingRow
              key={key}
              title={t(`settings.sound.${key}`)}
              description={t(`settings.sound.${key}Desc`)}
              icon={<Icon className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />}
              className={soundEnabled ? "" : "opacity-50 pointer-events-none"}
              control={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!soundEnabled}
                  onClick={play}
                  icon={<Play size={12} className="fill-current" />}
                  className="!h-7 text-[11px]"
                >
                  {t("common.start")}
                </Button>
              }
            />
          ))}
        </div>
      </SettingsGroup>
    </div>
  );
}
