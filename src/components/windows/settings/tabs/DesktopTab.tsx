import { useMemo } from "react";
import { LayoutGrid, PanelBottom, Type } from "lucide-react";
import { DesktopIcon } from "@/components/desktop/DesktopIcon";
import { useI18n } from "@/lib/i18n";
import { useThemeStore } from "@/store/themeStore";
import { useWindowStore } from "@/store/windowStore";
import type { AppShortcut } from "@/types";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { OptionCards } from "../OptionCards";

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
    <div className="space-y-3">
      {/* ── Single Unified Desktop & Taskbar Card ── */}
      <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
        {/* ── Section 1: Live Desktop Preview ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)] tracking-wider uppercase">
              {t("settings.desktop.preview")}
            </span>
            <span className="text-[10.5px] text-[var(--text-secondary)]">
              {desktopIconSize} · {desktopIconStyle} · {desktopIconFontSize}
            </span>
          </div>
          <div
            className="flex items-center justify-center sm:justify-start gap-4 p-3 rounded-lg border border-[var(--win-border)] bg-[var(--win-content-bg)]"
            aria-label={t("settings.desktop.preview")}
            role="img"
          >
            <div className="pointer-events-none flex flex-wrap items-start gap-3" aria-hidden="true">
              {previewApps.map((app) => (
                <DesktopIcon key={app.id} app={app} />
              ))}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── Section 2: Gaya & Ukuran Ikon Desktop ── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t("settings.iconStyle.title")}</h2>
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">{t("settings.iconStyle.subtitle")}</span>
          </div>

          <div className="space-y-3">
            {/* Gaya Ikon (Framed vs Plain) */}
            <OptionCards
              label={t("settings.iconStyle.title")}
              value={desktopIconStyle}
              onChange={setDesktopIconStyle}
              options={[
                { key: "framed", label: t("settings.iconStyle.framed"), description: t("settings.iconStyle.framedDesc") },
                { key: "plain", label: t("settings.iconStyle.plain"), description: t("settings.iconStyle.plainDesc") },
              ]}
            />

            {/* Ukuran Ikon */}
            <div>
              <p className="text-[11.5px] font-medium text-[var(--win-text)] mb-1.5">{t("settings.iconSize.title")}</p>
              <OptionCards
                label={t("settings.iconSize.title")}
                value={desktopIconSize}
                onChange={setDesktopIconSize}
                options={[
                  { key: "small", label: t("settings.iconSize.small"), description: t("settings.iconSize.smallDesc") },
                  { key: "medium", label: t("settings.iconSize.medium"), description: t("settings.iconSize.mediumDesc") },
                  { key: "large", label: t("settings.iconSize.large"), description: t("settings.iconSize.largeDesc") },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── Section 3: Tipografi Label Ikon Desktop ── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t("settings.desktop.fontTitle")}</h2>
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">{t("settings.desktop.fontSubtitle")}</span>
          </div>

          <div className="space-y-3">
            {/* Ukuran Teks Label */}
            <div>
              <p className="text-[11.5px] font-medium text-[var(--win-text)] mb-1.5">{t("settings.desktop.labelSize")}</p>
              <OptionCards
                label={t("settings.desktop.labelSize")}
                value={desktopIconFontSize}
                onChange={setDesktopIconFontSize}
                options={[
                  { key: "small", label: t("settings.desktop.labelSizeSmall") },
                  { key: "medium", label: t("settings.desktop.labelSizeMedium") },
                  { key: "large", label: t("settings.desktop.labelSizeLarge") },
                ]}
              />
            </div>

            {/* Ketebalan Teks */}
            <div>
              <p className="text-[11.5px] font-medium text-[var(--win-text)] mb-1.5">{t("settings.desktop.labelWeight")}</p>
              <OptionCards
                label={t("settings.desktop.labelWeight")}
                value={desktopIconFontWeight}
                onChange={setDesktopIconFontWeight}
                options={[
                  { key: "normal", label: t("settings.desktop.weightNormal") },
                  { key: "medium", label: t("settings.desktop.weightMedium") },
                  { key: "bold", label: t("settings.desktop.weightBold") },
                ]}
              />
            </div>

            {/* Efek Bayangan Teks (Toggle Row) */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-[var(--win-text)]">{t("settings.desktop.labelShadow")}</div>
                <div className="text-[11px] text-[var(--text-secondary)] leading-tight">{t("settings.desktop.labelShadowDesc")}</div>
              </div>
              <ToggleSwitch
                checked={desktopIconShadow}
                onChange={() => setDesktopIconShadow(!desktopIconShadow)}
                label={t("settings.desktop.labelShadow")}
              />
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── Section 4: Preferensi Desktop & Dock ── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <PanelBottom className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{t("settings.appearance.dockTitle")}</h2>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t("settings.appearance.autoHideDockDesc")}</p>
            </div>
          </div>
          <ToggleSwitch
            checked={autoHideDock}
            onChange={toggleDockAutoHide}
            label={t("settings.appearance.autoHideDock")}
          />
        </div>
      </div>
    </div>
  );
}
