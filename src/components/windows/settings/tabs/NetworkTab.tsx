import { LoaderCircle, LockKeyhole, Save, Waypoints } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { HostSettings } from "../hooks/useHostSettings";
import { FieldLabel } from "../SettingsPrimitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button"
import { TextInput, Textarea } from "@/components/ui/Field"

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

  return (
    <div className="space-y-4">
      <div className="panel-shell-card p-5">
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
                onChange={(event) =>
                  setPanelPort(
                    event.target.value.replace(/[^0-9]/g, ""),
                  )
                } mono className="h-[42px] px-3.5 text-[12px]"
                placeholder={t("settings.portPlaceholder")}
              />
            </div>
          </div>

          <div className="panel-muted-block rounded-[14px] px-4 py-3 text-[12px] leading-6 text-[var(--text-secondary)]">
            <div>
              <strong className="text-[var(--win-text)]">
                {t("settings.allowedHosts")}:
              </strong>{" "}
              {(systemSettings.allowedHosts ?? []).length
                ? (systemSettings.allowedHosts ?? []).join(", ")
                : "—"}
            </div>
            <div>
              <strong className="text-[var(--win-text)]">
                {t("settings.activeOrigins")}:
              </strong>{" "}
              {(systemSettings.allowedOrigins ?? []).length
                ? (systemSettings.allowedOrigins ?? []).join(", ")
                : "—"}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              id="settings-panel-port-save"
              type="button"
              onClick={handleUpdatePanelPort}
              disabled={
                panelPortMutation.isPending || !panelPort.trim()
              } variant="primary" className="rounded-xl px-[18px] py-2.5 text-[13px]"
            >
              {panelPortMutation.isPending ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <Waypoints size={14} />
              )}
              {panelPortMutation.isPending
                ? t("settings.changingPort")
                : t("settings.savePort")}
            </Button>
          </div>
        </div>
      </div>

      <div className="panel-shell-card p-5">
        <SectionHeader
          icon={<Waypoints />}
          title={t("settings.allowedOrigins")}
          subtitle={t("settings.allowedOriginsSubtitle")}
        />

        <div className="space-y-3.5">
          <div className="panel-muted-block rounded-[16px] p-3">
            <Textarea
              id="settings-allowed-origins"
              value={allowedOriginsText}
              onChange={(event) =>
                setAllowedOriginsText(event.target.value)
              }
              spellCheck={false} mono className="min-h-[220px] rounded-[12px] px-4 py-3 text-[12px] leading-6"
              placeholder={
                "http://127.0.0.1:80\nhttp://panel.domain.local:80"
              }
            />
          </div>

          <div className="panel-empty min-h-[92px] rounded-[14px] px-4 py-3 text-[12px] leading-6">
            <span>
              {t("settings.originsTipPrefix")}{" "}
              <code className="panel-mono text-[12px] text-[var(--win-text)]">
                http://127.0.0.1:80
              </code>{" "}
              {t("settings.originsTipOr")}{" "}
              <code className="panel-mono text-[12px] text-[var(--win-text)]">
                https://panel.example.com:443
              </code>
              .
            </span>
          </div>

          <div className="flex justify-end">
            <Button
              id="settings-panel-origins-save"
              type="button"
              onClick={handleUpdateOrigins}
              disabled={panelOriginsMutation.isPending} variant="primary" className="rounded-xl px-[18px] py-2.5 text-[13px]"
            >
              {panelOriginsMutation.isPending ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
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
