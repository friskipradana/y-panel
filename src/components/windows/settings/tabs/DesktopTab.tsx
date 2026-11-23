import { useMemo } from "react";
import { Check } from "lucide-react";
import { DesktopIcon } from "@/components/desktop/DesktopIcon";
import { useI18n } from "@/lib/i18n";
import { useThemeStore, type DesktopIconStyle, type DockStyle } from "@/store/themeStore";
import { useWindowStore } from "@/store/windowStore";
import type { AppShortcut } from "@/types";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { AdwActionRow, SettingsGroup } from "../SettingsPrimitives";

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
    dockStyle,
    setDockStyle,
  } = useThemeStore();
  const autoHideDock = useWindowStore((s) => s.autoHideDock);
  const toggleDockAutoHide = useWindowStore((s) => s.toggleDockAutoHide);

  const previewApps = useMemo<AppShortcut[]>(
    () => [
      { id: "apps", label: t("window.apps"), windowId: "apps" },
      { id: "file-manager", label: t("window.file-manager"), windowId: "file-manager" },
      { id: "system", label: t("window.system"), windowId: "system" },
    ],
    [t]
  );

  return (
    <div className="space-y-6">
      {/* ── 1. Live Desktop Preview Group ── */}
      <SettingsGroup
        title={t("settings.desktop.preview")}
        description={`${desktopIconSize} · ${desktopIconStyle} · ${desktopIconFontSize}`}
      >
        <div
          className="flex items-center justify-center sm:justify-start gap-4 p-4 rounded-xl border border-[var(--win-border)] bg-[var(--win-content-bg)]"
          aria-label={t("settings.desktop.preview")}
          role="img"
        >
          <div className="pointer-events-none flex flex-wrap items-start gap-4" aria-hidden="true">
            {previewApps.map((app) => (
              <DesktopIcon key={app.id} app={app} />
            ))}
          </div>
        </div>
      </SettingsGroup>

      {/* ── 2. Desktop Icon Appearance (Flat GNOME Action Rows) ── */}
      <SettingsGroup
        title={t("settings.iconStyle.title")}
        description={t("settings.iconStyle.subtitle")}
        cardClassName="!p-0"
      >
        {/* Gaya Ikon */}
        <AdwActionRow
          title={t("settings.iconStyle.title")}
          subtitle={t("settings.appearance.desktopIconStyleDesc")}
          control={
            <div
              role="group"
              aria-label={t("settings.iconStyle.title")}
              className="inline-flex flex-wrap rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-0.5"
            >
              {(
                [
                  { key: "glass", label: t("settings.appearance.iconStyleGlass") },
                  { key: "solid", label: t("settings.appearance.iconStyleSolid") },
                  { key: "framed", label: t("settings.appearance.iconStyleFramed") },
                  { key: "plain", label: t("settings.appearance.iconStylePlain") },
                ] as ReadonlyArray<{ key: DesktopIconStyle; label: string }>
              ).map((opt) => {
                const selected = desktopIconStyle === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setDesktopIconStyle(opt.key)}
                    className={`px-2.5 py-1 text-[11.5px] font-medium rounded-md transition-all cursor-pointer ${
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

        {/* Ukuran Ikon */}
        <AdwActionRow
          title={t("settings.iconSize.title")}
          subtitle={t("settings.iconSize.subtitle")}
          control={
            <div
              role="group"
              aria-label={t("settings.iconSize.title")}
              className="inline-flex rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-0.5"
            >
              {[
                { key: "small" as const, label: t("settings.iconSize.small") },
                { key: "medium" as const, label: t("settings.iconSize.medium") },
                { key: "large" as const, label: t("settings.iconSize.large") },
              ].map((opt) => {
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

        {/* Ukuran Label */}
        <AdwActionRow
          title={t("settings.desktop.labelSize")}
          control={
            <div
              role="group"
              aria-label={t("settings.desktop.labelSize")}
              className="inline-flex rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-0.5"
            >
              {[
                { key: "small" as const, label: t("settings.desktop.labelSizeSmall") },
                { key: "medium" as const, label: t("settings.desktop.labelSizeMedium") },
                { key: "large" as const, label: t("settings.desktop.labelSizeLarge") },
              ].map((opt) => {
                const selected = desktopIconFontSize === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setDesktopIconFontSize(opt.key)}
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

        {/* Ketebalan Huruf */}
        <AdwActionRow
          title={t("settings.desktop.labelWeight")}
          control={
            <div
              role="group"
              aria-label={t("settings.desktop.labelWeight")}
              className="inline-flex rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-0.5"
            >
              {[
                { key: "normal" as const, label: t("settings.desktop.weightNormal") },
                { key: "medium" as const, label: t("settings.desktop.weightMedium") },
                { key: "bold" as const, label: t("settings.desktop.weightBold") },
              ].map((opt) => {
                const selected = desktopIconFontWeight === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setDesktopIconFontWeight(opt.key)}
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

        {/* Bayangan Teks */}
        <AdwActionRow
          title={t("settings.desktop.labelShadow")}
          subtitle={t("settings.desktop.labelShadowDesc")}
          control={
            <ToggleSwitch
              checked={desktopIconShadow}
              onChange={() => setDesktopIconShadow(!desktopIconShadow)}
              label={t("settings.desktop.labelShadow")}
            />
          }
        />
      </SettingsGroup>

      {/* ── 3. Dock & Taskbar Group ── */}
      <SettingsGroup
        title={t("settings.appearance.dockTitle")}
        cardClassName="!p-0"
      >
        <div className="p-4 border-b border-[var(--win-border)]">
          <div className="mb-2.5">
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

        <AdwActionRow
          title={t("settings.appearance.autoHideDock")}
          subtitle={t("settings.appearance.autoHideDockDesc")}
          control={
            <ToggleSwitch
              checked={autoHideDock}
              onChange={toggleDockAutoHide}
              label={t("settings.appearance.autoHideDock")}
            />
          }
        />
      </SettingsGroup>
    </div>
  );
}
