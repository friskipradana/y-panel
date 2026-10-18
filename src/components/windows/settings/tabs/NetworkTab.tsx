import { LockKeyhole, Save, Waypoints } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { HostSettings } from "../hooks/useHostSettings";
import { FieldLabel } from "../SettingsPrimitives";
import { Button } from "@/components/ui/Button";
import { TextInput, Textarea } from "@/components/ui/Field";

// A labelled list of addresses, one chip each; a dash when there is none
function ChipList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {label}
        </span>
        <span className="text-[10px] font-mono text-[var(--text-secondary)]">
          {items.length}
        </span>
      </div>
      {items.length ? (
        <ul className="settings-chips max-h-[110px] overflow-y-auto pr-0.5">
          {items.map((item) => (
            <li key={item} className="settings-chip select-all">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-[11.5px] text-[var(--text-secondary)]">—</span>
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
    <div className="space-y-3">
      {/* ── Single Unified Network & Port Settings Card ── */}
      <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
        {/* Runtime Panel Port Section */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t("settings.runtimePanelPort")}</h2>
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">{t("settings.runtimePanelPortSubtitle")}</span>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <FieldLabel
                  label={t("settings.activeBindAddress")}
                  hint={t("settings.readOnly")}
                />
                <TextInput
                  id="settings-bind-addr"
                  value={systemSettings.bindAddr}
                  readOnly
                  mono
                  className="!h-8 px-2.5 text-[12px] opacity-80"
                />
              </div>
              <div>
                <FieldLabel
                  label={t("settings.panelPort")}
                  hint="1-65535"
                />
                <div className="flex items-center gap-2">
                  <TextInput
                    id="settings-panel-port"
                    inputMode="numeric"
                    value={panelPort}
                    invalid={portInvalid}
                    onChange={(event) =>
                      setPanelPort(
                        event.target.value.replace(/[^0-9]/g, ""),
                      )
                    }
                    mono
                    className="!h-8 px-2.5 text-[12px] flex-1"
                    placeholder={t("settings.portPlaceholder")}
                  />
                  <Button
                    id="settings-panel-port-save"
                    type="button"
                    size="sm"
                    onClick={handleUpdatePanelPort}
                    disabled={
                      panelPortMutation.isPending || !panelPort.trim() || portInvalid || !portDirty
                    }
                    variant="primary"
                    icon={<Save size={13} />}
                    loading={panelPortMutation.isPending}
                    className="shrink-0"
                  >
                    {panelPortMutation.isPending
                      ? t("settings.changingPort")
                      : t("settings.savePort")}
                  </Button>
                </div>
                {portInvalid ? (
                  <p role="alert" className="mt-1 text-[11px] text-[var(--panel-danger-text)]">
                    {t("settings.portInvalid")}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="settings-inset !p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ChipList label={t("settings.allowedHosts")} items={systemSettings.allowedHosts ?? []} />
                <ChipList label={t("settings.activeOrigins")} items={systemSettings.allowedOrigins ?? []} />
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* Allowed Origins Section */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Waypoints className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t("settings.allowedOrigins")}</h2>
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">{t("settings.allowedOriginsSubtitle")}</span>
          </div>

          <div className="space-y-2.5">
            <Textarea
              id="settings-allowed-origins"
              value={allowedOriginsText}
              onChange={(event) =>
                setAllowedOriginsText(event.target.value)
              }
              spellCheck={false}
              mono
              className="settings-origins"
              placeholder={
                "http://127.0.0.1:80\nhttp://panel.domain.local:80"
              }
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
                {t("settings.originsTipPrefix")}{" "}
                <code className="panel-mono text-[var(--win-text)]">http://127.0.0.1:80</code>{" "}
                {t("settings.originsTipOr")}{" "}
                <code className="panel-mono text-[var(--win-text)]">https://panel.example.com:443</code>.
              </p>

              <Button
                id="settings-panel-origins-save"
                type="button"
                size="sm"
                onClick={handleUpdateOrigins}
                disabled={!originsDirty}
                variant="primary"
                icon={<Save size={13} />}
                loading={panelOriginsMutation.isPending}
                className="shrink-0 self-end sm:self-auto"
              >
                {panelOriginsMutation.isPending
                  ? t("settings.savingOrigins")
                  : t("settings.saveOrigins")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
