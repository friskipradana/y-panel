import { CircleCheck, Globe2, Moon, Palette, RefreshCcw, Sun, Type } from "lucide-react";
import { alertLib } from "@/lib/alert";
import { useI18n, type Language } from "@/lib/i18n";
import { useThemeStore } from "@/store/themeStore";
import { Button } from "@/components/ui/Button";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { Select } from "@/components/ui/Select";

const FONTS = [
  { key: "outfit", name: "Outfit", css: "'Outfit', system-ui, sans-serif" },
  { key: "inter", name: "Inter", css: "'Inter', system-ui, sans-serif" },
  { key: "plus-jakarta-sans", name: "Plus Jakarta Sans", css: "'Plus Jakarta Sans', system-ui, sans-serif" },
  { key: "geist", name: "Geist", css: "'Geist', system-ui, sans-serif" },
  { key: "roboto", name: "Roboto", css: "'Roboto', system-ui, sans-serif" },
] as const;

// Language, light or dark, the typeface and its size in a unified compact card
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
    <div className="space-y-3">
      {/* ── Single Unified Appearance & Language Card ── */}
      <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
        {/* ── Section 1: Bahasa Tampilan ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Globe2 className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{t("settings.language.title")}</h2>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t("settings.language.subtitle")}</p>
            </div>
          </div>
          <div className="w-full shrink-0 sm:w-[180px]">
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
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── Section 2: Tema & Skema Warna ── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t("settings.appearance.themeTitle")}</h2>
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">{t("settings.appearance.themeSubtitle")}</span>
          </div>

          <div role="group" aria-label={t("settings.appearance.themeTitle")} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <SelectableCard
              selected={mode === "light"}
              onClick={() => setMode("light")}
              className="flex items-center gap-2.5 rounded-lg p-2.5 text-left"
            >
              <Sun className="h-4 w-4 shrink-0 text-[var(--panel-warning-text)]" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold text-[var(--win-text)]">{t("settings.appearance.lightMode")}</div>
                <div className="text-[10.5px] text-[var(--text-secondary)] leading-tight">{t("settings.appearance.lightModeDesc")}</div>
              </div>
              {mode === "light" ? <CircleCheck size={14} className="shrink-0 text-[var(--panel-primary-text)]" aria-hidden="true" /> : null}
            </SelectableCard>

            <SelectableCard
              selected={mode === "dark"}
              onClick={() => setMode("dark")}
              className="flex items-center gap-2.5 rounded-lg p-2.5 text-left"
            >
              <Moon className="h-4 w-4 shrink-0 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold text-[var(--win-text)]">{t("settings.appearance.darkMode")}</div>
                <div className="text-[10.5px] text-[var(--text-secondary)] leading-tight">{t("settings.appearance.darkModeDesc")}</div>
              </div>
              {mode === "dark" ? <CircleCheck size={14} className="shrink-0 text-[var(--panel-primary-text)]" aria-hidden="true" /> : null}
            </SelectableCard>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── Section 3: Font & Tipografi UI ── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t("settings.fonts.title")}</h2>
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">{t("settings.fonts.subtitle")}</span>
          </div>

          <div className="space-y-3">
            {/* Font Family */}
            <div>
              <p className="text-[11.5px] font-medium text-[var(--win-text)] mb-1.5">{t("settings.fonts.family")}</p>
              <div role="group" aria-label={t("settings.fonts.family")} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {FONTS.map((font) => {
                  const selected = fontFamily === font.key;
                  return (
                    <SelectableCard
                      key={font.key}
                      selected={selected}
                      onClick={() => setFontFamily(font.key)}
                      className="flex flex-col justify-between rounded-lg p-2 text-left h-[54px]"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[12.5px] font-semibold text-[var(--win-text)] truncate" style={{ fontFamily: font.css }}>
                          {font.name}
                        </span>
                        {selected ? <CircleCheck size={13} className="shrink-0 text-[var(--panel-primary-text)]" aria-hidden="true" /> : null}
                      </div>
                      <span className="text-[10.5px] text-[var(--text-secondary)] truncate font-normal" style={{ fontFamily: font.css }}>
                        Aa Bb Gg 123
                      </span>
                    </SelectableCard>
                  );
                })}
              </div>
            </div>

            {/* Font Size */}
            <div>
              <p className="text-[11.5px] font-medium text-[var(--win-text)] mb-1.5">{t("settings.fonts.size")}</p>
              <div role="group" aria-label={t("settings.fonts.size")} className="grid grid-cols-3 gap-2">
                {[
                  { key: "small" as const, label: t("settings.fonts.sizeSmall"), pct: "90%" },
                  { key: "medium" as const, label: t("settings.fonts.sizeMedium"), pct: "100%" },
                  { key: "large" as const, label: t("settings.fonts.sizeLarge"), pct: "110%" },
                ].map((opt) => {
                  const selected = fontSize === opt.key;
                  return (
                    <SelectableCard
                      key={opt.key}
                      selected={selected}
                      onClick={() => setFontSize(opt.key)}
                      className="flex items-center justify-between rounded-lg p-2 text-left h-[46px]"
                    >
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-[var(--win-text)]">{opt.label}</div>
                        <div className="text-[10.5px] text-[var(--text-secondary)]">{opt.pct}</div>
                      </div>
                      {selected ? <CircleCheck size={13} className="shrink-0 text-[var(--panel-primary-text)]" aria-hidden="true" /> : null}
                    </SelectableCard>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── Section 4: Reset Seluruh Tampilan ── */}
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-[var(--win-text)]">{t("settings.appearance.resetTitle")}</div>
            <div className="text-[10.5px] text-[var(--text-secondary)] leading-relaxed">{t("settings.appearance.resetSubtitle")}</div>
          </div>
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
        </div>
      </div>
    </div>
  );
}

