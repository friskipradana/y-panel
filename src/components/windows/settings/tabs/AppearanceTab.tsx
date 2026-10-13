import { CheckCircle2, Moon, Palette, RefreshCcw, Sun, Type } from "lucide-react";
import { alertLib } from "@/lib/alert";
import { useI18n } from "@/lib/i18n";
import { useThemeStore } from "@/store/themeStore";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { IconBadge } from "@/components/ui/IconBadge";
import { Button } from "@/components/ui/Button"

export function AppearanceTab() {
  const { t } = useI18n();
  const {
    mode,
    setMode,
    fontFamily,
    setFontFamily,
    fontSize,
    setFontSize,
    resetToDefaults,
  } = useThemeStore();
  const handleResetAllUIDefaults = async () => {
    const isConfirmed = await alertLib.confirm(
      t("settings.appearance.resetConfirmTitle"),
      t("settings.appearance.resetConfirmMessage"),
      t("settings.appearance.resetConfirmAction"),
      t("common.cancel"),
      "warning",
      "settings",
    );
    if (isConfirmed) {
      resetToDefaults();
      alertLib.fire(
        t("settings.appearance.resetSuccessTitle"),
        t("settings.appearance.resetSuccessMessage"),
        "success",
        "settings",
      );
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Theme Mode Card */}
      <div className="panel-shell-card p-3.5 flex flex-col gap-3">
        <SectionHeader
          icon={<Palette />}
          title={t("settings.appearance.themeTitle")}
          subtitle={t("settings.appearance.themeSubtitle")}
        />

        <div className="grid grid-cols-2 gap-3 max-w-[440px]">
          {/* Light Mode Option */}
          <SelectableCard selected={mode === "light"} onClick={() => setMode("light")} className="flex flex-col items-center gap-2 p-3 rounded-xl border text-center">
            <IconBadge size="md" tone="warning">
              <Sun />
            </IconBadge>
            <div>
              <div className="text-[12.5px] font-semibold text-[var(--win-text)]">
                {t("settings.appearance.lightMode")}
              </div>
              <div className="text-[10.5px] text-[var(--text-secondary)] mt-0.5">
                {t("settings.appearance.lightModeDesc")}
              </div>
            </div>
            {mode === "light" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--panel-primary-solid)] px-2 py-0.5 text-[10px] font-bold text-white">
                <CheckCircle2 size={10} /> {t("settings.appearance.active")}
              </span>
            )}
          </SelectableCard>

          {/* Dark Mode Option */}
          <SelectableCard selected={mode === "dark"} onClick={() => setMode("dark")} className="flex flex-col items-center gap-2 p-3 rounded-xl border text-center">
            <IconBadge size="md" tone="info">
              <Moon />
            </IconBadge>
            <div>
              <div className="text-[12.5px] font-semibold text-[var(--win-text)]">
                {t("settings.appearance.darkMode")}
              </div>
              <div className="text-[10.5px] text-[var(--text-secondary)] mt-0.5">
                {t("settings.appearance.darkModeDesc")}
              </div>
            </div>
            {mode === "dark" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--panel-primary-solid)] px-2 py-0.5 text-[10px] font-bold text-white">
                <CheckCircle2 size={10} /> {t("settings.appearance.active")}
              </span>
            )}
          </SelectableCard>
        </div>
      </div>

      {/* UI Fonts & Typography Card */}
      <div className="panel-shell-card p-3.5 flex flex-col gap-4">
        <SectionHeader
          icon={<Type />}
          title={t("settings.fonts.title")}
          subtitle={t("settings.fonts.subtitle")}
        />

        {/* Font Family Selection */}
        <div>
          <div className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2.5">
            {t("settings.fonts.family")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {[
              {
                key: "outfit" as const,
                name: "Outfit",
                desc: t("settings.fonts.outfitDesc"),
                fontCss: "'Outfit', system-ui, sans-serif",
              },
              {
                key: "inter" as const,
                name: "Inter",
                desc: t("settings.fonts.interDesc"),
                fontCss: "'Inter', system-ui, sans-serif",
              },
              {
                key: "plus-jakarta-sans" as const,
                name: "Plus Jakarta Sans",
                desc: t("settings.fonts.plusJakartaSansDesc"),
                fontCss: "'Plus Jakarta Sans', system-ui, sans-serif",
              },
              {
                key: "geist" as const,
                name: "Geist",
                desc: t("settings.fonts.geistDesc"),
                fontCss: "'Geist', system-ui, sans-serif",
              },
              {
                key: "roboto" as const,
                name: "Roboto",
                desc: t("settings.fonts.robotoDesc"),
                fontCss: "'Roboto', system-ui, sans-serif",
              },
            ].map((item) => {
              const isActive = fontFamily === item.key;
              return (
                <SelectableCard key={item.key} selected={isActive} onClick={() => setFontFamily(item.key)} className="flex flex-col p-3 rounded-xl border text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[13px] font-bold text-[var(--win-text)]"
                      style={{ fontFamily: item.fontCss }}
                    >
                      {item.name}
                    </span>
                    {isActive && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--panel-primary-solid)] px-1.5 py-0.2 text-[9px] font-bold text-white shrink-0">
                        <CheckCircle2 size={8} /> {t("settings.appearance.active")}
                      </span>
                    )}
                  </div>
                  <p
                    className="text-[11px] text-[var(--text-secondary)] mt-1 line-clamp-2 leading-relaxed"
                    style={{ fontFamily: item.fontCss }}
                  >
                    {item.desc}
                  </p>
                  <div
                    className="mt-2 text-[12px] font-medium text-[var(--win-text)] border-t border-[var(--win-border)]/60 pt-1.5 opacity-90 truncate"
                    style={{ fontFamily: item.fontCss }}
                  >
                    Aa Bb Gg 123
                  </div>
                </SelectableCard>
              );
            })}
          </div>
        </div>

        {/* Font Scaling & Size Selection */}
        <div className="pt-2 border-t border-[var(--win-border)]">
          <div className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2.5">
            {t("settings.fonts.size")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-[560px]">
            {[
              {
                key: "small" as const,
                label: t("settings.fonts.sizeSmall"),
                desc: t("settings.fonts.sizeSmallDesc"),
                scaleLabel: "14.5px (90%)",
              },
              {
                key: "medium" as const,
                label: t("settings.fonts.sizeMedium"),
                desc: t("settings.fonts.sizeMediumDesc"),
                scaleLabel: "16px (100%)",
              },
              {
                key: "large" as const,
                label: t("settings.fonts.sizeLarge"),
                desc: t("settings.fonts.sizeLargeDesc"),
                scaleLabel: "17.5px (110%)",
              },
            ].map((item) => {
              const isActive = fontSize === item.key;
              return (
                <SelectableCard key={item.key} selected={isActive} onClick={() => setFontSize(item.key)} className="flex flex-col p-2.5 rounded-xl border text-left">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[12px] font-bold text-[var(--win-text)]">
                      {item.label}
                    </span>
                    {isActive && (
                      <CheckCircle2 size={10} className="text-[var(--panel-primary-solid)] shrink-0" />
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--panel-primary-text)] font-mono mt-0.5">
                    {item.scaleLabel}
                  </span>
                  <p className="text-[10.5px] text-[var(--text-secondary)] mt-1 leading-snug">
                    {item.desc}
                  </p>
                </SelectableCard>
              );
            })}
          </div>
        </div>


        {/* Reset All UI & Appearance to Default Card */}
        <div className="pt-2 border-t border-[var(--win-border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="text-[12.5px] font-bold text-[var(--win-text)]">
              {t("settings.appearance.resetTitle")}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 max-w-[520px] leading-relaxed">
              {t("settings.appearance.resetSubtitle")}
            </div>
          </div>

          <Button
            type="button"
            onClick={handleResetAllUIDefaults} className="rounded-xl px-3.5 py-2 text-[12px] font-semibold flex items-center gap-1.5 shrink-0 border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 cursor-pointer transition-colors"
          >
            <RefreshCcw size={13} />
            {t("settings.appearance.resetBtn")}
          </Button>
        </div>
      </div>
    </div>
  );
}
