import { useState, type CSSProperties } from "react";
import { Check, Palette, RefreshCcw } from "lucide-react";
import { alertLib } from "@/lib/alert";
import { useI18n, type Language } from "@/lib/i18n";
import {
  normalizeHexColor,
  useThemeStore,
  type ColorTheme,
  type DesktopIconSize,
  type DesktopIconStyle,
  type DockStyle,
} from "@/store/themeStore";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { AdwActionRow, SettingsGroup } from "../SettingsPrimitives";

const COLOR_THEMES: ReadonlyArray<{ key: ColorTheme; labelKey: string }> = [
  { key: "white", labelKey: "settings.appearance.colorWhite" },
  { key: "black", labelKey: "settings.appearance.colorBlack" },
  { key: "pink", labelKey: "settings.appearance.colorPink" },
  { key: "blue", labelKey: "settings.appearance.colorBlue" },
  { key: "custom", labelKey: "settings.appearance.colorCustom" },
];

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
    colorTheme,
    setColorTheme,
    customThemeColor,
    setCustomThemeColor,
    fontFamily,
    setFontFamily,
    fontSize,
    setFontSize,
    desktopIconStyle,
    setDesktopIconStyle,
    desktopIconSize,
    setDesktopIconSize,
    dockStyle,
    setDockStyle,
    resetToDefaults,
  } = useThemeStore();

  const [hexDraft, setHexDraft] = useState(customThemeColor);
  const [syncedHex, setSyncedHex] = useState(customThemeColor);
  if (syncedHex !== customThemeColor) {
    setSyncedHex(customThemeColor);
    setHexDraft(customThemeColor);
  }
  const hexInvalid = colorTheme === "custom" && normalizeHexColor(hexDraft) === null;

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

      {/* ── 1b. Color Theme Group (White, Black, Pink, Blue, Custom) ── */}
      <SettingsGroup title={t("settings.appearance.colorThemeTitle")} cardClassName="!p-0">
        <div className="p-3.5 sm:p-4">
          <div className="theme-color-grid">
            {COLOR_THEMES.map((item) => {
              const active = colorTheme === item.key;
              const customPreviewStyle =
                item.key === "custom"
                  ? ({ "--theme-custom-preview": customThemeColor } as CSSProperties)
                  : undefined;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setColorTheme(item.key)}
                  aria-label={t(item.labelKey)}
                  aria-pressed={active}
                  className={`theme-color-card ${active ? "theme-color-card--active" : ""}`}
                >
                  <div
                    className={`theme-color-card__preview theme-color-card__preview--${item.key}`}
                    style={customPreviewStyle}
                  >
                    <div className="theme-color-card__bar" />
                    <div className="theme-color-card__body">
                      <span className="theme-color-card__pill" />
                    </div>
                  </div>
                  <div className="theme-color-card__footer">
                    <span className="theme-color-card__label">{t(item.labelKey)}</span>
                    {active ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-[var(--panel-primary-text)]" aria-hidden="true" />
                    ) : item.key === "custom" ? (
                      <Palette className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {colorTheme === "custom" ? (
          <AdwActionRow
            title={t("settings.appearance.customColorLabel")}
            subtitle={t("settings.appearance.customColorDesc")}
            control={
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={customThemeColor}
                  onChange={(e) => setCustomThemeColor(e.target.value)}
                  aria-label={t("settings.appearance.customColorPicker")}
                  title={t("settings.appearance.customColorPicker")}
                  className="theme-color-swatch-input"
                />
                <TextInput
                  mono
                  invalid={hexInvalid}
                  value={hexDraft}
                  maxLength={7}
                  onChange={(e) => {
                    const next = e.target.value;
                    setHexDraft(next);
                    const normalized = normalizeHexColor(next);
                    if (normalized) {
                      setCustomThemeColor(normalized);
                    }
                  }}
                  onBlur={() => {
                    const normalized = normalizeHexColor(hexDraft);
                    if (normalized) {
                      setCustomThemeColor(normalized);
                      setHexDraft(normalized);
                    } else {
                      setHexDraft(customThemeColor);
                    }
                  }}
                  aria-label={t("settings.appearance.customColorHex")}
                  placeholder={customThemeColor}
                  className="w-28"
                />
              </div>
            }
          />
        ) : null}
      </SettingsGroup>

      {/* Desktop Icon & Dock Style Group */}
      <SettingsGroup title={t("settings.appearance.desktopAndDockTitle")} cardClassName="!p-0">
        <div className="p-3.5 sm:p-4 space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[12.5px] font-semibold text-[var(--win-text)]">
                  {t("settings.appearance.desktopIconStyleLabel")}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  {t("settings.appearance.desktopIconStyleDesc")}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {(
                [
                  { key: "glass", labelKey: "settings.appearance.iconStyleGlass" },
                  { key: "solid", labelKey: "settings.appearance.iconStyleSolid" },
                  { key: "framed", labelKey: "settings.appearance.iconStyleFramed" },
                  { key: "plain", labelKey: "settings.appearance.iconStylePlain" },
                ] as ReadonlyArray<{ key: DesktopIconStyle; labelKey: string }>
              ).map((opt) => {
                const active = desktopIconStyle === opt.key;
                const boxPreviewClass =
                  opt.key === "glass"
                    ? "bg-[var(--win-content-bg)]/80 border border-[var(--win-border-focus)] shadow-sm backdrop-blur-md"
                    : opt.key === "solid"
                      ? "bg-[var(--win-content-bg)] border border-[var(--win-border)] shadow-sm"
                      : opt.key === "framed"
                        ? "bg-[var(--panel-surface-strong)] border border-[var(--win-border)]"
                        : "bg-transparent border border-dashed border-[var(--win-border)]";
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setDesktopIconStyle(opt.key)}
                    aria-pressed={active}
                    className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors cursor-pointer ${
                      active
                        ? "border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)]"
                        : "border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)]"
                    }`}
                  >
                    <div className="flex h-12 w-full flex-col items-center justify-center gap-1 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface-strong)] py-1.5">
                      <span className={`block h-5 w-5 rounded-md ${boxPreviewClass}`}>
                        <span className="m-1 block h-2.5 w-2.5 rounded-xs bg-[var(--panel-primary-solid)]" />
                      </span>
                      <span
                        className={
                          opt.key === "glass" || opt.key === "solid"
                            ? "h-1.5 w-7 rounded-full bg-[var(--win-content-bg)] border border-[var(--win-border)]"
                            : "h-1.5 w-7 rounded-full bg-[var(--text-secondary)] opacity-50"
                        }
                      />
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--win-text)]">
                      {t(opt.labelKey)}
                      {active ? <Check className="h-3 w-3 text-[var(--panel-primary-text)]" aria-hidden="true" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2">
              <div className="text-[12.5px] font-semibold text-[var(--win-text)]">
                {t("settings.appearance.dockStyleLabel")}
              </div>
              <div className="text-[11px] text-[var(--text-secondary)]">
                {t("settings.appearance.dockStyleDesc")}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {(
                [
                  { key: "floating", labelKey: "settings.appearance.dockStyleFloating" },
                  { key: "panel", labelKey: "settings.appearance.dockStylePanel" },
                  { key: "compact", labelKey: "settings.appearance.dockStyleCompact" },
                ] as ReadonlyArray<{ key: DockStyle; labelKey: string }>
              ).map((opt) => {
                const active = dockStyle === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setDockStyle(opt.key)}
                    aria-pressed={active}
                    className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors cursor-pointer ${
                      active
                        ? "border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)]"
                        : "border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)]"
                    }`}
                  >
                    <div className="flex h-10 w-full items-end justify-center overflow-hidden rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-1">
                      <div
                        className={
                          opt.key === "panel"
                            ? "flex w-full items-center justify-center gap-1.5 border-t border-[var(--win-border)] bg-[var(--win-content-bg)] py-1"
                            : opt.key === "compact"
                              ? "mb-0.5 flex items-center gap-1 rounded-md border border-[var(--win-border)] bg-[var(--win-content-bg)] px-2 py-0.5"
                              : "mb-0.5 flex items-center gap-1.5 rounded-lg border border-[var(--win-border)] bg-[var(--win-content-bg)] px-2.5 py-1 shadow-xs"
                        }
                      >
                        <span className="h-2 w-2 rounded-xs bg-[var(--panel-primary-solid)]" />
                        <span className="h-2 w-2 rounded-xs bg-[var(--text-secondary)] opacity-60" />
                        <span className="h-2 w-2 rounded-xs bg-[var(--text-secondary)] opacity-60" />
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--win-text)]">
                      {t(opt.labelKey)}
                      {active ? <Check className="h-3 w-3 text-[var(--panel-primary-text)]" aria-hidden="true" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <AdwActionRow
          title={t("settings.appearance.desktopIconSizeLabel")}
          subtitle={t("settings.appearance.desktopIconSizeDesc")}
          control={
            <div
              role="group"
              aria-label={t("settings.appearance.desktopIconSizeLabel")}
              className="inline-flex rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-0.5"
            >
              {(
                [
                  { key: "small", label: t("settings.fonts.sizeSmall") },
                  { key: "medium", label: t("settings.fonts.sizeMedium") },
                  { key: "large", label: t("settings.fonts.sizeLarge") },
                ] as ReadonlyArray<{ key: DesktopIconSize; label: string }>
              ).map((opt) => {
                const selected = desktopIconSize === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setDesktopIconSize(opt.key)}
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
