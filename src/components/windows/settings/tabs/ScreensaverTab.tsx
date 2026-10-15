import { Clock, Lock, LockKeyhole, Monitor, MonitorPlay, Orbit, Terminal } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useThemeStore } from "@/store/themeStore";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { IconBadge } from "@/components/ui/IconBadge";
import { Button } from "@/components/ui/Button"

export function ScreensaverTab() {
  const { t } = useI18n();
  const {
    lockScreenStyle,
    setLockScreenStyle,
    lockScreenEnabled,
    setLockScreenEnabled,
    requirePasswordOnWake,
    setRequirePasswordOnWake,
    wakeOnMouseMove,
    setWakeOnMouseMove,
    autoLockTimeout,
    setAutoLockTimeout,
    setIsLocked,
  } = useThemeStore();

  return (
    <div className="space-y-4">
      {/* Master Lock Screen Enable/Disable Card */}
      <div className="panel-shell-card p-3.5 flex flex-col gap-3">
        <SectionHeader
          icon={<Lock />}
          title={t("settings.screensaver.masterTitle")}
          subtitle={t("settings.screensaver.masterSubtitle")}
        />

        <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
          <div>
            <div className="text-[12.5px] font-semibold text-[var(--win-text)]">
              {t("settings.screensaver.enableToggle")}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              {lockScreenEnabled
                ? t("settings.screensaver.enableActive")
                : t("settings.screensaver.enableInactive")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLockScreenEnabled(!lockScreenEnabled)}
            className={`relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              lockScreenEnabled
                ? "bg-[var(--panel-primary-solid)]"
                : "bg-gray-400/30"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                lockScreenEnabled ? "translate-x-4.5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Wake Authentication Card */}
      <div className="panel-shell-card p-3.5 flex flex-col gap-3">
        <SectionHeader
          icon={<LockKeyhole />}
          title={t("settings.screensaver.authTitle")}
          subtitle={t("settings.screensaver.authSubtitle")}
        />

        <div className="max-w-[560px] space-y-2">
          <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
            <div>
              <div className="text-[12.5px] font-semibold text-[var(--win-text)]">
                {t("settings.screensaver.requirePassword")}
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                {requirePasswordOnWake
                  ? t("settings.screensaver.requirePasswordActive")
                  : t("settings.screensaver.requirePasswordInactive")}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRequirePasswordOnWake(!requirePasswordOnWake)}
              className={`relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                requirePasswordOnWake
                  ? "bg-[var(--panel-primary-solid)]"
                  : "bg-gray-400/30"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  requirePasswordOnWake ? "translate-x-4.5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
            <div>
              <div className="text-[12.5px] font-semibold text-[var(--win-text)]">
                {t("settings.screensaver.wakeOnMouseMove")}
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                {wakeOnMouseMove
                  ? t("settings.screensaver.wakeOnMouseMoveActive")
                  : t("settings.screensaver.wakeOnMouseMoveInactive")}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWakeOnMouseMove(!wakeOnMouseMove)}
              className={`relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                wakeOnMouseMove
                  ? "bg-[var(--panel-primary-solid)]"
                  : "bg-gray-400/30"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  wakeOnMouseMove ? "translate-x-4.5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Screensaver Visual Model Card */}
      <div className="panel-shell-card p-3.5 flex flex-col gap-3">
        <SectionHeader
          icon={<MonitorPlay />}
          title={t("settings.screensaver.styleTitle")}
          subtitle={t("settings.screensaver.styleSubtitle")}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-[560px]">
          {[
            {
              id: "clock" as const,
              label: t("settings.screensaver.styleClock"),
              desc: t("settings.screensaver.styleClockDesc"),
              icon: <Clock size={16} className="text-sky-400" />,
            },
            {
              id: "matrix" as const,
              label: t("settings.screensaver.styleMatrix"),
              desc: t("settings.screensaver.styleMatrixDesc"),
              icon: <Terminal size={16} className="text-emerald-400" />,
            },
            {
              id: "starfield" as const,
              label: t("settings.screensaver.styleStarfield"),
              desc: t("settings.screensaver.styleStarfieldDesc"),
              icon: <Orbit size={16} className="text-indigo-400" />,
            },
            {
              id: "none" as const,
              label: t("settings.screensaver.styleNone"),
              desc: t("settings.screensaver.styleNoneDesc"),
              icon: <Monitor size={16} className="text-slate-400" />,
            },
          ].map((item) => {
            const isSelected = lockScreenStyle === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setLockScreenStyle(item.id)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                  isSelected
                    ? "border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)] shadow-sm ring-1 ring-[var(--panel-primary-solid)]/30"
                    : "border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)]"
                }`}
              >
                <IconBadge size="md">
                  {item.icon}
                </IconBadge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-[12px] font-bold ${isSelected ? "text-[var(--panel-primary-text)]" : "text-[var(--win-text)]"}`}>
                      {item.label}
                    </span>
                    {isSelected && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--panel-primary-solid)]" />
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-4">
                    {item.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Auto-Lock Timeout & Manual Trigger Card */}
      <div className="panel-shell-card p-4.5 flex flex-col gap-4">
        <SectionHeader
          icon={<Clock />}
          title={t("settings.screensaver.timeoutTitle")}
          subtitle={t("settings.screensaver.timeoutSubtitle")}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-w-[620px]">
          <div className="p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-[var(--win-text)]">
                {t("settings.screensaver.idleTimeout")}
              </div>
              <div className="text-[11.5px] text-[var(--text-secondary)] mt-0.5">
                {t("settings.screensaver.idleTimeoutDesc")}
              </div>
            </div>
            <select
              value={autoLockTimeout}
              onChange={(e) => setAutoLockTimeout(parseInt(e.target.value, 10))}
              className="panel-input text-[12.5px] py-1.5 px-3 rounded-lg w-full bg-[var(--panel-surface-hover)] text-[var(--win-text)] border border-[var(--win-border)]"
            >
              <option value={0}>{t("settings.screensaver.timeoutNever")}</option>
              <option value={5}>{t("settings.screensaver.timeout5Min")}</option>
              <option value={15}>{t("settings.screensaver.timeout15Min")}</option>
              <option value={30}>{t("settings.screensaver.timeout30Min")}</option>
              <option value={60}>{t("settings.screensaver.timeout1Hour")}</option>
            </select>
          </div>

          <div className="p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-[var(--win-text)]">
                {t("settings.screensaver.lockNow")}
              </div>
              <div className="text-[11.5px] text-[var(--text-secondary)] mt-0.5">
                {t("settings.screensaver.lockNowDesc")}
              </div>
            </div>
            <Button
              type="button"
              onClick={() => setIsLocked(true)} variant="primary" className="text-[12px] py-2 px-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock size={14} />
              <span>{t("settings.screensaver.lockNowBtn")}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
