import { useAuthStore } from "@/store/authStore";
import { SitePublicCard } from "../SitePublicCard";
import { UpdateCard } from "../UpdateCard";
import { SettingsSaveBar } from "../SettingsSaveBar";
import { Globe2, Server } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { HostSettings } from "../hooks/useHostSettings";
import { FieldLabel, TimezoneSelect, DnsEditor } from "../SettingsPrimitives";
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
    <div className="space-y-3">
      {/* ── Single Unified Host & System Settings Card ── */}
      <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
        {/* Host System & Reneo Updates Section */}
        <UpdateCard systemSettings={systemSettings} bare />

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* Host Identity Section */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t("settings.identity")}</h2>
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
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* DNS Nameservers Section */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t("settings.dnsNameservers")}</h2>
            </div>
            <span className="text-[11px] font-mono text-[var(--text-secondary)] truncate">
              {systemSettings.dnsMode} ({systemSettings.managedConfigPath})
            </span>
          </div>

          <DnsEditor
            nameservers={nameservers}
            onChange={setNameservers}
          />
        </div>

        {/* Public Site Section */}
        {isSuperadmin ? (
          <>
            <div className="border-t border-[var(--win-border)]" />
            <SitePublicCard bare />
          </>
        ) : null}
      </div>

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
