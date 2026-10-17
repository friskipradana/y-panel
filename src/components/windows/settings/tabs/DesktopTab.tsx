import { LayoutGrid, Maximize2, PanelBottom, Type } from "lucide-react";
import { DesktopIcon } from "@/components/desktop/DesktopIcon";
import { useI18n } from "@/lib/i18n";
import { useThemeStore } from "@/store/themeStore";
import { useWindowStore } from "@/store/windowStore";
import type { AppShortcut } from "@/types";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { SettingRow } from "@/components/ui/SettingRow";
import { OptionCards } from "../OptionCards";

// The real desktop icon, so every choice below shows its effect at once
function IconPreview() {
  const { t } = useI18n();
  const apps: AppShortcut[] = [
    { id: "apps", label: t("window.apps"), windowId: "apps" },
    { id: "file-manager", label: t("window.file-manager"), windowId: "file-manager" },
    { id: "system", label: t("window.system"), windowId: "system" },
  ];
  return (
    <div className="settings-preview" aria-label={t("settings.desktop.preview")} role="img">
      <p className="settings-preview__label">{t("settings.desktop.preview")}</p>
      <div className="pointer-events-none flex flex-wrap items-start gap-2" aria-hidden="true">
        {apps.map((app) => (
          <DesktopIcon key={app.id} app={app} />
        ))}
      </div>
    </div>
  );
}

export function DesktopTab() {
  const { t } = useI18n();
  const { desktopIconStyle, setDesktopIconStyle, desktopIconSize, setDesktopIconSize, desktopIconFontSize, setDesktopIconFontSize, desktopIconFontWeight, setDesktopIconFontWeight, desktopIconShadow, setDesktopIconShadow } = useThemeStore();
  const autoHideDock = useWindowStore((s) => s.autoHideDock);
  const toggleDockAutoHide = useWindowStore((s) => s.toggleDockAutoHide);

  return (
    <div className="space-y-3.5">
      <IconPreview />

      <section className="panel-shell-card settings-card">
        <SectionHeader icon={<LayoutGrid />} title={t("settings.iconStyle.title")} subtitle={t("settings.iconStyle.subtitle")} />
        <OptionCards
          label={t("settings.iconStyle.title")}
          value={desktopIconStyle}
          onChange={setDesktopIconStyle}
          options={[
            { key: "framed", label: t("settings.iconStyle.framed"), description: t("settings.iconStyle.framedDesc") },
            { key: "plain", label: t("settings.iconStyle.plain"), description: t("settings.iconStyle.plainDesc") },
          ]}
        />
      </section>

      <section className="panel-shell-card settings-card">
        <SectionHeader icon={<Maximize2 />} title={t("settings.iconSize.title")} subtitle={t("settings.iconSize.subtitle")} />
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
      </section>

      <section className="panel-shell-card settings-card">
        <SectionHeader icon={<Type />} title={t("settings.desktop.fontTitle")} subtitle={t("settings.desktop.fontSubtitle")} />
        <div className="space-y-2">
          <p className="panel-section-label">{t("settings.desktop.labelSize")}</p>
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
        <div className="space-y-2">
          <p className="panel-section-label">{t("settings.desktop.labelWeight")}</p>
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
        <SettingRow
          title={t("settings.desktop.labelShadow")}
          description={t("settings.desktop.labelShadowDesc")}
          control={<ToggleSwitch checked={desktopIconShadow} onChange={() => setDesktopIconShadow(!desktopIconShadow)} label={t("settings.desktop.labelShadow")} />}
        />
      </section>

      <section className="panel-shell-card settings-card">
        <SectionHeader icon={<PanelBottom />} title={t("settings.appearance.dockTitle")} subtitle={t("settings.appearance.dockSubtitle")} />
        <SettingRow
          title={t("settings.appearance.autoHideDock")}
          description={t("settings.appearance.autoHideDockDesc")}
          control={<ToggleSwitch checked={autoHideDock} onChange={toggleDockAutoHide} label={t("settings.appearance.autoHideDock")} />}
        />
      </section>
    </div>
  );
}
