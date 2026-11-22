import { useAuthStore } from "@/store/authStore";
import { SitePublicCard } from "../SitePublicCard";
import { KvmSettingsCard } from "../KvmSettingsCard";
import { UpdateCard } from "../UpdateCard";
import { SettingsSaveBar } from "../SettingsSaveBar";
import { useI18n } from "@/lib/i18n";
import type { HostSettings } from "../hooks/useHostSettings";
import { FieldLabel, TimezoneSelect, DnsEditor, SettingsGroup } from "../SettingsPrimitives";
import { TextInput } from "@/components/ui/Field";

export function GeneralTab({ host, systemSettings, active = true }: { host: HostSettings; systemSettings: NonNullable<HostSettings["query"]["data"]>; active?: boolean }) {
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
    <div className="space-y-6">
      {/* ── 1. Host System & Updates Group ── */}
      <SettingsGroup title={t("settings.update.title")}>
        <UpdateCard systemSettings={systemSettings} bare />
      </SettingsGroup>

      {/* ── 2. Host Identity Group ── */}
      <SettingsGroup
        title={t("settings.identity")}
        description={t("settings.identitySubtitle")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
      <SettingsGroup
        title={t("settings.dnsNameservers")}
        description={`${systemSettings.dnsMode} (${systemSettings.managedConfigPath || ""})`}
      >
        <DnsEditor
          nameservers={nameservers}
          onChange={setNameservers}
        />
      </SettingsGroup>

      {/* ── 4. Public Site & Remote Desktop Group ── */}
      {isSuperadmin ? (
        <SettingsGroup title={t("settings.site.title")}>
          <div className="flex flex-col gap-3">
            <SitePublicCard bare />
            <div className="border-t border-[var(--win-border)]" />
            <KvmSettingsCard bare active={active} />
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
