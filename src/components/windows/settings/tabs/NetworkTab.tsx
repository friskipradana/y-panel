import { LockKeyhole, Save, Waypoints } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { HostSettings } from "../hooks/useHostSettings";
import { FieldLabel } from "../SettingsPrimitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button"
import { TextInput, Textarea } from "@/components/ui/Field"

// A labelled list of addresses, one chip each; a dash when there is none
function ChipList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">{label}</p>
      {items.length ? (
        <ul className="settings-chips">
          {items.map((item) => (
            <li key={item} className="settings-chip">{item}</li>
          ))}
        </ul>
      ) : (
        <span className="text-[12px] text-[var(--text-secondary)]">—</span>
      )}
    </div>
  );
}

export function NetworkTab({ host, systemSettings }: { host: HostSettings; systemSettings: NonNullable<HostSettings["query"]["data"]> }) {
  const { t } = useI18n();
  const {
    panelPort,
    setPanelPort,
    allowedOriginsText,
    setAllowedOriginsText,
    panelPortMutation,
    panelOriginsMutation,
    handleUpdatePanelPort,
    handleUpdateOrigins,
  } = host;

  // a button that saves nothing stays off: only what differs from the saved settings counts
  const savedPort = systemSettings.bindAddr?.split(":").slice(-1)[0] ?? "";
  const portNumber = Number(panelPort.trim());
  const portInvalid = panelPort.trim() !== "" && (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535);
  const portDirty = panelPort.trim() !== savedPort;
  const savedOrigins = systemSettings.originsRaw || (systemSettings.allowedOrigins ?? []).join("\n");
  const originsDirty = allowedOriginsText !== savedOrigins;

  return (
    <div className="space-y-4">
      <div className="panel-shell-card settings-card">
        <SectionHeader
          icon={<LockKeyhole />}
          title={t("settings.runtimePanelPort")}
          subtitle={t("settings.runtimePanelPortSubtitle")}
        />

        <div className="space-y-3.5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <FieldLabel
                label={t("settings.activeBindAddress")}
                hint={t("settings.readOnly")}
              />
              <TextInput
                id="settings-bind-addr"
                value={systemSettings.bindAddr}
                readOnly mono className="h-[42px] px-3.5 text-[12px] opacity-80"
              />
            </div>
            <div>
              <FieldLabel
                label={t("settings.panelPort")}
                hint="1-65535"
              />
              <TextInput
                id="settings-panel-port"
                inputMode="numeric"
                value={panelPort}
                invalid={portInvalid}
                onChange={(event) =>
                  setPanelPort(
                    event.target.value.replace(/[^0-9]/g, ""),
                  )
                } mono className="h-[42px] px-3.5 text-[12px]"
                placeholder={t("settings.portPlaceholder")}
              />
              {portInvalid ? (
                <p role="alert" className="mt-1.5 text-[12px] text-[var(--panel-danger-text)]">
                  {t("settings.portInvalid")}
                </p>
              ) : null}
            </div>
          </div>

          <div className="settings-inset space-y-3">
            <ChipList label={t("settings.allowedHosts")} items={systemSettings.allowedHosts ?? []} />
            <ChipList label={t("settings.activeOrigins")} items={systemSettings.allowedOrigins ?? []} />
          </div>

          <div className="flex justify-end">
            <Button
              id="settings-panel-port-save"
              type="button"
              onClick={handleUpdatePanelPort}
              disabled={
                panelPortMutation.isPending || !panelPort.trim() || portInvalid || !portDirty
              } variant="primary" icon={<Waypoints size={14} />} loading={panelPortMutation.isPending}
            >
              {panelPortMutation.isPending
                ? t("settings.changingPort")
                : t("settings.savePort")}
            </Button>
          </div>
        </div>
      </div>

      <div className="panel-shell-card settings-card">
        <SectionHeader
          icon={<Waypoints />}
          title={t("settings.allowedOrigins")}
          subtitle={t("settings.allowedOriginsSubtitle")}
        />

        <div className="space-y-3.5">
          <Textarea
            id="settings-allowed-origins"
            value={allowedOriginsText}
            onChange={(event) =>
              setAllowedOriginsText(event.target.value)
            }
            spellCheck={false} mono className="settings-origins"
            placeholder={
              "http://127.0.0.1:80\nhttp://panel.domain.local:80"
            }
          />

          <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
            {t("settings.originsTipPrefix")}{" "}
            <code className="panel-mono text-[var(--win-text)]">http://127.0.0.1:80</code>{" "}
            {t("settings.originsTipOr")}{" "}
            <code className="panel-mono text-[var(--win-text)]">https://panel.example.com:443</code>.
          </p>

          <div className="flex justify-end">
            <Button
              id="settings-panel-origins-save"
              type="button"
              onClick={handleUpdateOrigins}
              disabled={!originsDirty} variant="primary" icon={<Save size={14} />} loading={panelOriginsMutation.isPending}
            >
              {panelOriginsMutation.isPending
                ? t("settings.savingOrigins")
                : t("settings.saveOrigins")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
