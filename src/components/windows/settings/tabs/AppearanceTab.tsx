import { Globe2, RefreshCcw, Type } from "lucide-react";
import { alertLib } from "@/lib/alert";
import { useI18n, type Language } from "@/lib/i18n";
import { useThemeStore } from "@/store/themeStore";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { SettingRow } from "@/components/ui/SettingRow";
import { SettingsGroup } from "../SettingsPrimitives";

const FONTS = [
  { key: "outfit", name: "Outfit", css: "'Outfit', system-ui, sans-serif" },
  { key: "inter", name: "Inter", css: "'Inter', system-ui, sans-serif" },
  { key: "plus-jakarta-sans", name: "Plus Jakarta Sans", css: "'Plus Jakarta Sans', system-ui, sans-serif" },
  { key: "geist", name: "Geist", css: "'Geist', system-ui, sans-serif" },
  { key: "roboto", name: "Roboto", css: "'Roboto', system-ui, sans-serif" },
] as const;

export function AppearanceTab() {
  const { t, language, setLanguage } = useI18n();
  const { mode, setMode, fontFamily, setFontFamily, fontSize, setFontSize, resetToDefaults } = useThemeStore();

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
      alertLib.fire(t("settings.appearance.resetSuccessTitle"), t("settings.appearance.resetSuccessMessage"), "success", "settings");
    }
  };

  return (
    <div className="space-y-4">
      {/* ── 1. GNOME Style Selector (Dual Window Mockups) ── */}
      <SettingsGroup
        title={t("settings.appearance.themeTitle")}
        description={t("settings.appearance.themeSubtitle")}
      >
        <div role="radiogroup" aria-label={t("settings.appearance.themeTitle")} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Light Style Mockup Card */}
          <button
            type="button"
            role="radio"
            aria-checked={mode === "light"}
            onClick={() => setMode("light")}
            className={`group relative flex flex-col items-center rounded-xl p-3 border-2 transition-all cursor-pointer text-left ${
              mode === "light"
                ? "border-[var(--panel-primary-text)] bg-[var(--panel-primary-bg)]/20 shadow-xs"
                : "border-[var(--win-border)] bg-[var(--panel-surface-strong)] hover:border-[var(--panel-primary-text)]/40 hover:bg-[var(--panel-surface-hover)]"
            }`}
          >
            {/* Miniature Adwaita Window Preview (Light) */}
            <div className="adw-preview adw-preview--light">
              <div className="adw-preview__bar">
                <div className="adw-preview__dot" />
                <div className="adw-preview__dot" />
                <div className="adw-preview__title" />
              </div>
              <div className="adw-preview__body">
                <div className="adw-preview__side">
                  <div className="adw-preview__pill adw-preview__pill--active w-full" />
                  <div className="adw-preview__pill w-4/5" />
                  <div className="adw-preview__pill w-3/5" />
                </div>
                <div className="adw-preview__main">
                  <div className="flex flex-col gap-1">
                    <div className="adw-preview__pill adw-preview__pill--active w-3/4" />
                    <div className="adw-preview__pill w-full" />
                    <div className="adw-preview__pill w-5/6" />
                  </div>
                  <div className="adw-preview__pill adw-preview__pill--active w-1/2 self-end" />
                </div>
              </div>
            </div>

            {/* Radio Indicator & Label */}
            <div className="mt-2.5 flex items-center gap-2">
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                  mode === "light"
                    ? "border-[var(--panel-primary-text)] bg-[var(--panel-primary-text)]"
                    : "border-[var(--win-border)] bg-[var(--panel-surface)]"
                }`}
              >
                {mode === "light" ? <div className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
              </div>
              <span className="text-[12.5px] font-semibold text-[var(--win-text)]">
                {t("settings.appearance.lightMode")}
              </span>
            </div>
          </button>

          {/* Dark Style Mockup Card */}
          <button
            type="button"
            role="radio"
            aria-checked={mode === "dark"}
            onClick={() => setMode("dark")}
            className={`group relative flex flex-col items-center rounded-xl p-3 border-2 transition-all cursor-pointer text-left ${
              mode === "dark"
                ? "border-[var(--panel-primary-text)] bg-[var(--panel-primary-bg)]/20 shadow-xs"
                : "border-[var(--win-border)] bg-[var(--panel-surface-strong)] hover:border-[var(--panel-primary-text)]/40 hover:bg-[var(--panel-surface-hover)]"
            }`}
          >
            {/* Miniature Adwaita Window Preview (Dark) */}
            <div className="adw-preview adw-preview--dark">
              <div className="adw-preview__bar">
                <div className="adw-preview__dot" />
                <div className="adw-preview__dot" />
                <div className="adw-preview__title" />
              </div>
              <div className="adw-preview__body">
                <div className="adw-preview__side">
                  <div className="adw-preview__pill adw-preview__pill--active w-full" />
                  <div className="adw-preview__pill w-4/5" />
                  <div className="adw-preview__pill w-3/5" />
                </div>
                <div className="adw-preview__main">
                  <div className="flex flex-col gap-1">
                    <div className="adw-preview__pill adw-preview__pill--active w-3/4" />
                    <div className="adw-preview__pill w-full" />
                    <div className="adw-preview__pill w-5/6" />
                  </div>
                  <div className="adw-preview__pill adw-preview__pill--active w-1/2 self-end" />
                </div>
              </div>
            </div>

            {/* Radio Indicator & Label */}
            <div className="mt-2.5 flex items-center gap-2">
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                  mode === "dark"
                    ? "border-[var(--panel-primary-text)] bg-[var(--panel-primary-text)]"
                    : "border-[var(--win-border)] bg-[var(--panel-surface)]"
                }`}
              >
                {mode === "dark" ? <div className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
              </div>
              <span className="text-[12.5px] font-semibold text-[var(--win-text)]">
                {t("settings.appearance.darkMode")}
              </span>
            </div>
          </button>
        </div>
      </SettingsGroup>

      {/* ── 2. Boxed Preferences Group: Language & Typography ── */}
      <SettingsGroup
        title={t("settings.fonts.title")}
        description={t("settings.fonts.subtitle")}
      >
        <div className="flex flex-col">
          {/* Row 1: Language */}
          <SettingRow
            title={t("settings.language.title")}
            description={t("settings.language.subtitle")}
            icon={<Globe2 size={16} className="text-[var(--panel-primary-text)]" />}
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

          {/* Row 2: Font Family */}
          <SettingRow
            title={t("settings.fonts.family")}
            description={t("settings.fonts.subtitle")}
            icon={<Type size={16} className="text-[var(--panel-primary-text)]" />}
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
          >
            {/* Quick Preview Chips for Fonts */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1">
              {FONTS.map((font) => {
                const selected = fontFamily === font.key;
                return (
                  <button
                    key={font.key}
                    type="button"
                    onClick={() => setFontFamily(font.key)}
                    className={`flex flex-col px-2 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      selected
                        ? "border-[var(--panel-primary-text)] bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)] font-semibold"
                        : "border-[var(--win-border)] bg-[var(--panel-surface-strong)] text-[var(--win-text)] hover:border-[var(--win-border-hover)]"
                    }`}
                  >
                    <span className="text-[11.5px] truncate" style={{ fontFamily: font.css }}>
                      {font.name}
                    </span>
                    <span className="text-[9.5px] opacity-75 truncate" style={{ fontFamily: font.css }}>
                      Aa Bb 123
                    </span>
                  </button>
                );
              })}
            </div>
          </SettingRow>

          {/* Row 3: Text Scale / Font Size */}
          <SettingRow
            title={t("settings.fonts.size")}
            description={t("settings.fonts.subtitle")}
            control={
              <div role="group" aria-label={t("settings.fonts.size")} className="inline-flex rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-0.5">
                {[
                  { key: "small" as const, label: t("settings.fonts.sizeSmall"), pct: "90%" },
                  { key: "medium" as const, label: t("settings.fonts.sizeMedium"), pct: "100%" },
                  { key: "large" as const, label: t("settings.fonts.sizeLarge"), pct: "110%" },
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
                      {opt.label} ({opt.pct})
                    </button>
                  );
                })}
              </div>
            }
          />

          {/* Row 4: Reset Defaults */}
          <SettingRow
            title={t("settings.appearance.resetTitle")}
            description={t("settings.appearance.resetSubtitle")}
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
        </div>
      </SettingsGroup>
    </div>
  );
}
