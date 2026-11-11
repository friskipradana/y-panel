import { useMemo } from "react";
import { DesktopIcon } from "@/components/desktop/DesktopIcon";
import { useI18n } from "@/lib/i18n";
import { useThemeStore } from "@/store/themeStore";
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
          subtitle={t("settings.iconStyle.subtitle")}
          control={
            <div
              role="group"
              aria-label={t("settings.iconStyle.title")}
              className="inline-flex rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-0.5"
            >
              {[
                { key: "framed" as const, label: t("settings.iconStyle.framed") },
                { key: "plain" as const, label: t("settings.iconStyle.plain") },
              ].map((opt) => {
                const selected = desktopIconStyle === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setDesktopIconStyle(opt.key)}
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
