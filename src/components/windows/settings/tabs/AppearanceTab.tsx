import { RefreshCcw } from "lucide-react";
import { alertLib } from "@/lib/alert";
import { useI18n, type Language } from "@/lib/i18n";
import { useThemeStore } from "@/store/themeStore";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { AdwActionRow, SettingsGroup } from "../SettingsPrimitives";

const FONTS = [
  { key: "outfit", name: "Outfit", css: "'Outfit', system-ui, sans-serif" },
  { key: "inter", name: "Inter", css: "'Inter', system-ui, sans-serif" },
  { key: "plus-jakarta-sans", name: "Plus Jakarta Sans", css: "'Plus Jakarta Sans', system-ui, sans-serif" },
  { key: "geist", name: "Geist", css: "'Geist', system-ui, sans-serif" },
  { key: "roboto", name: "Roboto", css: "'Roboto', system-ui, sans-serif" },
] as const;

export function AppearanceTab() {
  const { t, language, setLanguage } = useI18n();
  const {
    mode,
    setMode,
    fontFamily,
    setFontFamily,
    fontSize,
    setFontSize,
    resetToDefaults,
  } = useThemeStore();

  const reset = async () => {
    const confirmed = await alertLib.confirm(
      t("settings.appearance.resetConfirmTitle"),
      t("settings.appearance.resetConfirmMessage"),
      t("settings.appearance.resetConfirmAction"),
      t("common.cancel"),
      "warning",
      "settings"
    );
    if (confirmed) {
      resetToDefaults();
      alertLib.fire(
        t("settings.appearance.resetSuccessTitle"),
        t("settings.appearance.resetSuccessMessage"),
        "success",
        "settings"
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* ── 1. Style Group (Authentic Dual Overlapping Windows Mockup) ── */}
      <SettingsGroup title={t("settings.appearance.style")}>
        <div className="grid grid-cols-2 gap-4 sm:gap-8 justify-items-center py-1 sm:py-2">
          {/* Default (Light) Style Preview */}
          <button
            type="button"
            onClick={() => setMode("light")}
            aria-label={t("settings.appearance.default")}
            className={`adw-style-card ${mode === "light" ? "adw-style-card--active" : ""}`}
          >
            <div className="adw-style-card__preview">
              <div className="adw-mockup adw-mockup--light">
                <div className="adw-mockup__back-win">
                  <div className="adw-mockup__bar" />
                </div>
                <div className="adw-mockup__front-win">
                  <div className="adw-mockup__bar" />
                </div>
              </div>
            </div>
            <span className="adw-style-card__label">
              {t("settings.appearance.default")}
            </span>
          </button>

          {/* Dark Style Preview */}
          <button
            type="button"
            onClick={() => setMode("dark")}
            aria-label={t("settings.appearance.dark")}
            className={`adw-style-card ${mode === "dark" ? "adw-style-card--active" : ""}`}
          >
            <div className="adw-style-card__preview">
              <div className="adw-mockup adw-mockup--dark">
                <div className="adw-mockup__back-win">
                  <div className="adw-mockup__bar" />
                </div>
                <div className="adw-mockup__front-win">
                  <div className="adw-mockup__bar" />
                </div>
              </div>
            </div>
            <span className="adw-style-card__label">
              {t("settings.appearance.dark")}
            </span>
          </button>
        </div>
      </SettingsGroup>

      {/* ── 2. Preferences Group (Flat GNOME Action Rows) ── */}
      <SettingsGroup title={t("settings.appearance.preferences")} cardClassName="!p-0">
        <AdwActionRow
          title={t("settings.language.title")}
          subtitle={t("settings.language.subtitle")}
          control={
            <div className="w-[180px]">
              <Select
                id="settings-language-select"
                value={language}
                onChange={(value) => setLanguage(value as Language)}
                buttonClassName="!h-8 text-[12px] px-2.5"
                options={[
                  { value: "id", label: t("language.indonesian") },
                  { value: "en", label: t("language.english") },
                ]}
              />
            </div>
          }
        />

        <AdwActionRow
          title={t("settings.fonts.family")}
          subtitle={t("settings.fonts.subtitle")}
          control={
            <div className="w-[200px]">
              <Select
                id="settings-font-family-select"
                value={fontFamily}
                onChange={(val) => setFontFamily(val as typeof fontFamily)}
                buttonClassName="!h-8 text-[12px] px-2.5"
                options={FONTS.map((font) => ({
                  value: font.key,
                  label: font.name,
                }))}
              />
            </div>
          }
        />

        <AdwActionRow
          title={t("settings.fonts.size")}
          subtitle={t("settings.fonts.subtitle")}
          control={
            <div
              role="group"
              aria-label={t("settings.fonts.size")}
              className="inline-flex rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-0.5"
            >
              {[
                { key: "small" as const, label: t("settings.fonts.sizeSmall") },
                { key: "medium" as const, label: t("settings.fonts.sizeMedium") },
                { key: "large" as const, label: t("settings.fonts.sizeLarge") },
              ].map((opt) => {
                const selected = fontSize === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setFontSize(opt.key)}
                    className={`px-3 py-1 text-[11.5px] font-medium rounded-md transition-all cursor-pointer ${
                      selected
                        ? "bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)] font-semibold shadow-xs"
                        : "text-[var(--text-secondary)] hover:text-[var(--win-text)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          }
        />

        <AdwActionRow
          title={t("settings.appearance.resetTitle")}
          subtitle={t("settings.appearance.resetSubtitle")}
          control={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 text-[11.5px] !h-8"
              icon={<RefreshCcw className="h-3.5 w-3.5" />}
              onClick={() => void reset()}
            >
              {t("settings.appearance.resetBtn")}
            </Button>
          }
        />
      </SettingsGroup>
    </div>
  );
}
