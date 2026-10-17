import { useAuthStore } from "@/store/authStore";
import { SitePublicCard } from "../SitePublicCard";
import { UpdateCard } from "../UpdateCard";
import { SettingsSaveBar } from "../SettingsSaveBar";
import { Globe2, Server } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { HostSettings } from "../hooks/useHostSettings";
import { FieldLabel, TimezoneSelect, DnsEditor } from "../SettingsPrimitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { IconBadge } from "@/components/ui/IconBadge";
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
    <div className="space-y-3.5">
      {/* Compact Host System Info Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] shadow-xs">
        <div className="flex items-center gap-3">
          <IconBadge size="md" tone="primary">
            <Server />
          </IconBadge>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-bold text-[var(--win-text)] capitalize">
                {systemSettings.osName}
              </span>
              <span className="inline-flex items-center rounded-md bg-[var(--panel-surface-hover)] border border-[var(--win-border)] px-2 py-0.5 text-[11px] font-mono text-[var(--text-secondary)]">
                {systemSettings.kernel}
              </span>
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              {t("settings.detectedHost")}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface-hover)] px-3 py-1.5 text-[11.5px] text-[var(--win-text)] font-mono">
            <Globe2
              size={13}
              className="text-[var(--panel-primary-text)]"
            />
            <span>
              {t("settings.dnsLabel")}: <strong className="font-semibold text-[var(--win-text)]">{systemSettings.dnsMode}</strong>
            </span>
          </div>
        </div>
      </div>

      <UpdateCard />

      {/* Host Identity Card */}
      <div className="panel-shell-card settings-card">
        <SectionHeader
          icon={<Server />}
          title={t("settings.identity")}
          subtitle={t("settings.identitySubtitle")}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              onChange={(event) =>
                setHostname(event.target.value)
              } className="h-[38px] px-3 text-[12.5px] font-medium"
              placeholder={t("settings.hostnamePlaceholder")}
            />
            {hostnameError ? (
              <p id="settings-hostname-error" role="alert" className="mt-1.5 text-[12px] text-[var(--panel-danger-text)]">
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

      {/* DNS Configuration Card */}
      <div className="panel-shell-card settings-card">
        <SectionHeader
          icon={<Globe2 />}
          title={t("settings.dnsNameservers")}
          subtitle={t("settings.activeMode", {
            mode: systemSettings.dnsMode,
            path: systemSettings.managedConfigPath,
          })}
        />

        <DnsEditor
          nameservers={nameservers}
          onChange={setNameservers}
        />
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

      {isSuperadmin ? <SitePublicCard /> : null}
    </div>
  );
}
