import { CircleCheck, Globe2, Moon, Palette, RefreshCcw, Sun, Type } from "lucide-react";
import { alertLib } from "@/lib/alert";
import { useI18n, type Language } from "@/lib/i18n";
import { useThemeStore } from "@/store/themeStore";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { Select } from "@/components/ui/Select";
import { OptionCards } from "../OptionCards";

const FONTS = [
  { key: "outfit", name: "Outfit", css: "'Outfit', system-ui, sans-serif", desc: "settings.fonts.outfitDesc" },
  { key: "inter", name: "Inter", css: "'Inter', system-ui, sans-serif", desc: "settings.fonts.interDesc" },
  { key: "plus-jakarta-sans", name: "Plus Jakarta Sans", css: "'Plus Jakarta Sans', system-ui, sans-serif", desc: "settings.fonts.plusJakartaSansDesc" },
  { key: "geist", name: "Geist", css: "'Geist', system-ui, sans-serif", desc: "settings.fonts.geistDesc" },
  { key: "roboto", name: "Roboto", css: "'Roboto', system-ui, sans-serif", desc: "settings.fonts.robotoDesc" },
] as const;

// Language, light or dark, the typeface and its size
export function AppearanceTab() {
  const { t, language, setLanguage } = useI18n();
  const { mode, setMode, fontFamily, setFontFamily, fontSize, setFontSize, resetToDefaults } = useThemeStore();

  const reset = async () => {
    const confirmed = await alertLib.confirm(t("settings.appearance.resetConfirmTitle"), t("settings.appearance.resetConfirmMessage"), t("settings.appearance.resetConfirmAction"), t("common.cancel"), "warning", "settings");
    if (confirmed) {
      resetToDefaults();
      alertLib.fire(t("settings.appearance.resetSuccessTitle"), t("settings.appearance.resetSuccessMessage"), "success", "settings");
    }
  };

  return (
    <div className="space-y-3.5">
      <section className="panel-shell-card settings-card sm:flex-row sm:items-center sm:justify-between">
        <SectionHeader icon={<Globe2 />} title={t("settings.language.title")} subtitle={t("settings.language.subtitle")} />
        <div className="w-full shrink-0 sm:w-[220px]">
          <Select
            id="settings-language-select"
            value={language}
            onChange={(value) => setLanguage(value as Language)}
            options={[
              { value: "id", label: t("language.indonesian") },
              { value: "en", label: t("language.english") },
            ]}
          />
        </div>
      </section>

      <section className="panel-shell-card settings-card">
        <SectionHeader icon={<Palette />} title={t("settings.appearance.themeTitle")} subtitle={t("settings.appearance.themeSubtitle")} />
        <OptionCards
          label={t("settings.appearance.themeTitle")}
          value={mode}
          onChange={setMode}
          options={[
            { key: "light", label: t("settings.appearance.lightMode"), description: t("settings.appearance.lightModeDesc"), icon: <Sun /> },
            { key: "dark", label: t("settings.appearance.darkMode"), description: t("settings.appearance.darkModeDesc"), icon: <Moon /> },
          ]}
        />
      </section>

      <section className="panel-shell-card settings-card">
        <SectionHeader icon={<Type />} title={t("settings.fonts.title")} subtitle={t("settings.fonts.subtitle")} />

        <div className="space-y-2">
          <p className="panel-section-label">{t("settings.fonts.family")}</p>
          <div role="group" aria-label={t("settings.fonts.family")} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {FONTS.map((font) => {
              const selected = fontFamily === font.key;
              return (
                <SelectableCard key={font.key} selected={selected} onClick={() => setFontFamily(font.key)} className="flex flex-col rounded-xl p-3 text-left">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-[var(--win-text)]" style={{ fontFamily: font.css }}>
                      {font.name}
                    </span>
                    {selected ? <CircleCheck size={15} className="shrink-0 text-[var(--panel-primary-text)]" aria-hidden="true" /> : null}
                  </span>
                  <span className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-secondary)]" style={{ fontFamily: font.css }}>
                    {t(font.desc)}
                  </span>
                  <span className="mt-2 truncate border-t border-[var(--win-border)] pt-1.5 text-[12px] font-medium text-[var(--win-text)]" style={{ fontFamily: font.css }}>
                    Aa Bb Gg 123
                  </span>
                </SelectableCard>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 border-t border-[var(--win-border)] pt-3.5">
          <p className="panel-section-label">{t("settings.fonts.size")}</p>
          <OptionCards
            label={t("settings.fonts.size")}
            value={fontSize}
            onChange={setFontSize}
            options={[
              { key: "small", label: `${t("settings.fonts.sizeSmall")} · 90%`, description: t("settings.fonts.sizeSmallDesc") },
              { key: "medium", label: `${t("settings.fonts.sizeMedium")} · 100%`, description: t("settings.fonts.sizeMediumDesc") },
              { key: "large", label: `${t("settings.fonts.sizeLarge")} · 110%`, description: t("settings.fonts.sizeLargeDesc") },
            ]}
          />
        </div>

        <div className="flex flex-col items-start justify-between gap-3 border-t border-[var(--win-border)] pt-3.5 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <div className="text-[12.5px] font-bold text-[var(--win-text)]">{t("settings.appearance.resetTitle")}</div>
            <div className="mt-0.5 max-w-[520px] text-[11px] leading-relaxed text-[var(--text-secondary)]">{t("settings.appearance.resetSubtitle")}</div>
          </div>
          <Button type="button" variant="ghost" className="shrink-0" icon={<RefreshCcw className="h-3.5 w-3.5" />} onClick={() => void reset()}>
            {t("settings.appearance.resetBtn")}
          </Button>
        </div>
      </section>
    </div>
  );
}
