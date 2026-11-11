import { useAuthStore } from "@/store/authStore";
import { SitePublicCard } from "../SitePublicCard";
import { KvmSettingsCard } from "../KvmSettingsCard";
import { UpdateCard } from "../UpdateCard";
import { SettingsSaveBar } from "../SettingsSaveBar";
import { Globe2, Server } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { HostSettings } from "../hooks/useHostSettings";
import { FieldLabel, TimezoneSelect, DnsEditor, SettingsGroup } from "../SettingsPrimitives";
import { TextInput } from "@/components/ui/Field";

export function GeneralTab({ host, systemSettings }: { host: HostSettings; systemSettings: NonNullable<HostSettings["query"]["data"]> }) {
  const { t } = useI18n();
  const isSuperadmin = useAuthStore((s) => s.user?.role) === "superadmin";
  const {
    hostname,
    setHostname,
    timezone,
    setTimezone,
    nameservers,
    setNameservers,
    mutation,
    handleUpdateIdentity,
    hostnameError,
    identityDirty,
  } = host;

  return (
    <div className="space-y-4">
      {/* ── 1. Host System & Updates Group ── */}
      <SettingsGroup title={t("settings.update.title")}>
        <UpdateCard systemSettings={systemSettings} bare />
      </SettingsGroup>

      {/* ── 2. Host Identity Group ── */}
      <SettingsGroup title={t("settings.identity")}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0" strokeWidth={1.75} />
            <h3 className="text-[13px] font-semibold text-[var(--win-text)]">{t("settings.identity")}</h3>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">{t("settings.identitySubtitle")}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel
              label={t("settings.hostname")}
              hint="hostnamectl"
            />
            <TextInput
              id="settings-hostname"
              mono
              value={hostname}
              invalid={hostnameError}
              aria-describedby={hostnameError ? "settings-hostname-error" : undefined}
              onChange={(event) => setHostname(event.target.value)}
              className="!h-8 px-2.5 text-[12px] font-medium"
              placeholder={t("settings.hostnamePlaceholder")}
            />
            {hostnameError ? (
              <p id="settings-hostname-error" role="alert" className="mt-1 text-[11px] text-[var(--panel-danger-text)]">
                {t("settings.hostnameInvalid")}
              </p>
            ) : null}
          </div>
          <div>
            <FieldLabel
              label={t("settings.timezone")}
              hint="timedatectl"
            />
            <TimezoneSelect
              value={timezone}
              onChange={setTimezone}
            />
          </div>
        </div>
      </SettingsGroup>

      {/* ── 3. DNS Nameservers Group ── */}
      <SettingsGroup title={t("settings.dnsNameservers")}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Globe2 className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0" strokeWidth={1.75} />
            <h3 className="text-[13px] font-semibold text-[var(--win-text)]">{t("settings.dnsNameservers")}</h3>
          </div>
          <span className="text-[11px] font-mono text-[var(--text-secondary)] truncate max-w-[170px] sm:max-w-none shrink-0" title={systemSettings.managedConfigPath}>
            <span className="hidden sm:inline">{systemSettings.dnsMode} ({systemSettings.managedConfigPath})</span>
            <span className="sm:hidden">{systemSettings.dnsMode}</span>
          </span>
        </div>

        <DnsEditor
          nameservers={nameservers}
          onChange={setNameservers}
        />
      </SettingsGroup>

      {/* ── 4. Public Site & Remote Desktop Group ── */}
      {isSuperadmin ? (
        <SettingsGroup title={t("settings.site.title")}>
          <div className="flex flex-col gap-4">
            <SitePublicCard bare />
            <div className="border-t border-[var(--win-border)]" />
            <KvmSettingsCard bare />
          </div>
        </SettingsGroup>
      ) : null}

      <SettingsSaveBar
        id="settings-save"
        title={t("settings.saveHostChanges")}
        hint={identityDirty ? t("settings.saveHostChangesHint") : t("settings.noChanges")}
        dirty={identityDirty}
        pending={mutation.isPending}
        invalid={hostnameError}
        onSave={handleUpdateIdentity}
        saveLabel={t("settings.saveSettings")}
        pendingLabel={t("settings.saving")}
      />
    </div>
  );
}
