import { CheckCircle2, Layout, Type } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useThemeStore } from "@/store/themeStore";
import { useWindowStore } from "@/store/windowStore";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { SettingRow } from "@/components/ui/SettingRow";

export function DesktopTab() {
  const { t } = useI18n();
  const {
    desktopIconStyle,
    setDesktopIconStyle,
    desktopIconSize,
    setDesktopIconSize,
    desktopIconFontSize,
    setDesktopIconFontSize,
    desktopIconFontWeight,
    setDesktopIconFontWeight,
    desktopIconShadow,
    setDesktopIconShadow,
  } = useThemeStore();
  const autoHideDock = useWindowStore((s) => s.autoHideDock);
  const toggleDockAutoHide = useWindowStore((s) => s.toggleDockAutoHide);

  return (
    <div className="space-y-3.5">
      {/* Desktop Icon Style Card */}
      <div className="panel-shell-card p-3.5 flex flex-col gap-3">
        <SectionHeader
          icon={<Layout />}
          title={t("settings.iconStyle.title")}
          subtitle={t("settings.iconStyle.subtitle")}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[520px]">
          {/* Framed Option */}
          <SelectableCard selected={desktopIconStyle === "framed"} onClick={() => setDesktopIconStyle("framed")} className="flex items-center gap-3 p-3 rounded-xl border text-left">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/20 backdrop-blur-md border border-white/10 shadow-md shadow-black/20">
              <Layout size={18} className="text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1.5">
                <div className="text-[12.5px] font-semibold text-[var(--win-text)]">
                  {t("settings.iconStyle.framed")}
                </div>
                {desktopIconStyle === "framed" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--panel-primary-solid)] px-2 py-0.5 text-[9.5px] font-bold text-white shrink-0">
                    <CheckCircle2 size={9} /> {t("settings.appearance.active")}
                  </span>
                )}
              </div>
              <div className="text-[10.5px] text-[var(--text-secondary)] mt-0.5 leading-snug">
                {t("settings.iconStyle.framedDesc")}
              </div>
            </div>
          </SelectableCard>

          {/* Plain / Borderless Option */}
          <SelectableCard selected={desktopIconStyle === "plain"} onClick={() => setDesktopIconStyle("plain")} className="flex items-center gap-3 p-3 rounded-xl border text-left">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)]">
              <Layout size={20} className="text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1.5">
                <div className="text-[12.5px] font-semibold text-[var(--win-text)]">
                  {t("settings.iconStyle.plain")}
                </div>
                {desktopIconStyle === "plain" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--panel-primary-solid)] px-2 py-0.5 text-[9.5px] font-bold text-white shrink-0">
                    <CheckCircle2 size={9} /> {t("settings.appearance.active")}
                  </span>
                )}
              </div>
              <div className="text-[10.5px] text-[var(--text-secondary)] mt-0.5 leading-snug">
                {t("settings.iconStyle.plainDesc")}
              </div>
            </div>
          </SelectableCard>
        </div>
      </div>

      {/* Desktop Icon Size Card */}
      <div className="panel-shell-card p-3.5 flex flex-col gap-3">
        <SectionHeader
          icon={<Layout />}
          title={t("settings.iconSize.title")}
          subtitle={t("settings.iconSize.subtitle")}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-[560px]">
          {/* Small Option */}
          <SelectableCard selected={desktopIconSize === "small"} onClick={() => setDesktopIconSize("small")} className="flex flex-col items-center gap-2 p-3 rounded-xl border text-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/20 backdrop-blur-md border border-white/10 shadow-sm text-sky-400">
              <Layout size={16} />
            </div>
            <div className="w-full">
              <div className="flex items-center justify-center gap-1">
                <span className="text-[12px] font-semibold text-[var(--win-text)]">
                  {t("settings.iconSize.small")}
                </span>
                {desktopIconSize === "small" && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--panel-primary-solid)] px-1.5 py-0.2 text-[9px] font-bold text-white">
                    <CheckCircle2 size={8} />
                  </span>
                )}
              </div>
              <div className="text-[10.5px] text-[var(--text-secondary)] mt-0.5 leading-snug">
                {t("settings.iconSize.smallDesc")}
              </div>
            </div>
          </SelectableCard>

          {/* Medium Option */}
          <SelectableCard selected={desktopIconSize === "medium"} onClick={() => setDesktopIconSize("medium")} className="flex flex-col items-center gap-2 p-3 rounded-xl border text-center">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/20 backdrop-blur-md border border-white/10 shadow-sm text-sky-400">
              <Layout size={18} />
            </div>
            <div className="w-full">
              <div className="flex items-center justify-center gap-1">
                <span className="text-[12px] font-semibold text-[var(--win-text)]">
                  {t("settings.iconSize.medium")}
                </span>
                {desktopIconSize === "medium" && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--panel-primary-solid)] px-1.5 py-0.2 text-[9px] font-bold text-white">
                    <CheckCircle2 size={8} />
                  </span>
                )}
              </div>
              <div className="text-[10.5px] text-[var(--text-secondary)] mt-0.5 leading-snug">
                {t("settings.iconSize.mediumDesc")}
              </div>
            </div>
          </SelectableCard>

          {/* Large Option */}
          <SelectableCard selected={desktopIconSize === "large"} onClick={() => setDesktopIconSize("large")} className="flex flex-col items-center gap-2 p-3 rounded-xl border text-center">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/20 backdrop-blur-md border border-white/10 shadow-sm text-sky-400">
              <Layout size={20} />
            </div>
            <div className="w-full">
              <div className="flex items-center justify-center gap-1">
                <span className="text-[12px] font-semibold text-[var(--win-text)]">
                  {t("settings.iconSize.large")}
                </span>
                {desktopIconSize === "large" && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--panel-primary-solid)] px-1.5 py-0.2 text-[9px] font-bold text-white">
                    <CheckCircle2 size={8} />
                  </span>
                )}
              </div>
              <div className="text-[10.5px] text-[var(--text-secondary)] mt-0.5 leading-snug">
                {t("settings.iconSize.largeDesc")}
              </div>
            </div>
          </SelectableCard>
        </div>
      </div>

      {/* Desktop Icon Label Typography Card */}
      <div className="panel-shell-card p-3.5 flex flex-col gap-4">
        <SectionHeader
          icon={<Type />}
          title={t("settings.desktop.fontTitle")}
          subtitle={t("settings.desktop.fontSubtitle")}
        />

        {/* Label Size Selection */}
        <div>
          <div className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
            {t("settings.desktop.labelSize")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-[560px]">
            {[
              { key: "small" as const, label: t("settings.desktop.labelSizeSmall"), px: "10px" },
              { key: "medium" as const, label: t("settings.desktop.labelSizeMedium"), px: "11px" },
              { key: "large" as const, label: t("settings.desktop.labelSizeLarge"), px: "12.5px" },
            ].map((item) => {
              const isActive = desktopIconFontSize === item.key;
              return (
                <SelectableCard key={item.key} selected={isActive} onClick={() => setDesktopIconFontSize(item.key)} className="flex items-center justify-between p-2.5 rounded-xl border">
                  <span className="text-[12px] font-bold text-[var(--win-text)]">
                    {item.label}
                  </span>
                  {isActive && (
                    <CheckCircle2 size={12} className="text-[var(--panel-primary-solid)] shrink-0" />
                  )}
                </SelectableCard>
              );
            })}
          </div>
        </div>

        {/* Label Font Weight */}
        <div className="pt-2 border-t border-[var(--win-border)]">
          <div className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
            {t("settings.desktop.labelWeight")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-[560px]">
            {[
              { key: "normal" as const, label: t("settings.desktop.weightNormal"), fontClass: "font-normal" },
              { key: "medium" as const, label: t("settings.desktop.weightMedium"), fontClass: "font-medium" },
              { key: "bold" as const, label: t("settings.desktop.weightBold"), fontClass: "font-bold" },
            ].map((item) => {
              const isActive = desktopIconFontWeight === item.key;
              return (
                <SelectableCard key={item.key} selected={isActive} onClick={() => setDesktopIconFontWeight(item.key)} className="flex items-center justify-between p-2.5 rounded-xl border">
                  <span className={`text-[12px] text-[var(--win-text)] ${item.fontClass}`}>
                    {item.label}
                  </span>
                  {isActive && (
                    <CheckCircle2 size={12} className="text-[var(--panel-primary-solid)] shrink-0" />
                  )}
                </SelectableCard>
              );
            })}
          </div>
        </div>

        {/* Drop Shadow Toggle & Mini Preview */}
        <div className="pt-2 border-t border-[var(--win-border)] flex flex-col gap-3">
          <SettingRow
            title={t("settings.desktop.labelShadow")}
            description={t("settings.desktop.labelShadowDesc")}
            control={<ToggleSwitch checked={desktopIconShadow} onChange={() => setDesktopIconShadow(!desktopIconShadow)} />}
          />
        </div>
      </div>

      {/* Desktop & Dock Controls Card */}
      <div className="panel-shell-card p-4.5 flex flex-col gap-4">
        <SectionHeader
          icon={<Layout />}
          title={t("settings.appearance.dockTitle")}
          subtitle={t("settings.appearance.dockSubtitle")}
        />

        <div className="space-y-3">
          {/* Auto-hide Dock Toggle */}
          <SettingRow
            title={t("settings.appearance.autoHideDock")}
            description={t("settings.appearance.autoHideDockDesc")}
            control={<ToggleSwitch checked={autoHideDock} onChange={toggleDockAutoHide} />}
          />
        </div>
      </div>
    </div>
  );
}
