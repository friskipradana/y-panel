import { Globe2, LoaderCircle, Save, Server } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { useI18n, type Language } from "@/lib/i18n";
import type { HostSettings } from "../hooks/useHostSettings";
import { FieldLabel, TimezoneSelect, DnsEditor } from "../SettingsPrimitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { IconBadge } from "@/components/ui/IconBadge";
import { Button } from "@/components/ui/Button"
import { TextInput } from "@/components/ui/Field"

export function GeneralTab({ host, systemSettings }: { host: HostSettings; systemSettings: NonNullable<HostSettings["query"]["data"]> }) {
  const { language, setLanguage, t } = useI18n();
  const {
    hostname,
    setHostname,
    timezone,
    setTimezone,
    nameservers,
    setNameservers,
    mutation,
    handleUpdateIdentity,
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
              {t("settings.general.hostRuntime")}
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
              DNS: <strong className="font-semibold text-[var(--win-text)]">{systemSettings.dnsMode}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Host Identity Card */}
      <div className="panel-shell-card p-4.5 flex flex-col gap-4">
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
              value={hostname}
              onChange={(event) =>
                setHostname(event.target.value)
              } className="h-[38px] px-3 text-[12.5px] font-medium"
              placeholder={t("settings.hostnamePlaceholder")}
            />
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
      <div className="panel-shell-card p-4.5 flex flex-col gap-4">
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

        {/* Action Bar */}
        <div className="border-t border-[var(--win-border)] pt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-[var(--win-text)]">
              {t("settings.saveHostChanges")}
            </div>
            <div className="text-[11.5px] text-[var(--text-secondary)] mt-0.5">
              {t("settings.saveHostChangesHint")}
            </div>
          </div>

          <Button
            id="settings-save"
            type="button"
            onClick={handleUpdateIdentity}
            disabled={mutation.isPending} variant="primary" className="rounded-xl px-5 py-2 text-[13px] font-semibold flex items-center gap-2 cursor-pointer shadow-sm transition-all"
          >
            {mutation.isPending ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {mutation.isPending
              ? t("settings.saving")
              : t("settings.saveSettings")}
          </Button>
        </div>
      </div>

      {/* Language Preferences Card */}
      <div className="panel-shell-card p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <IconBadge size="md" tone="neutral">
            <Globe2 />
          </IconBadge>
          <div>
            <div className="text-[13px] font-semibold text-[var(--win-text)]">
              {t("settings.language.title")}
            </div>
            <div className="text-[11.5px] text-[var(--text-secondary)] mt-0.5 max-w-[480px]">
              {t("settings.language.subtitle")}
            </div>
          </div>
        </div>

        <div className="w-full sm:w-[220px] shrink-0">
          <Select
            id="settings-language-select"
            value={language}
            onChange={(value) => setLanguage(value as Language)}
            options={[
              { value: "id", label: t("language.indonesian") },
              { value: "en", label: t("language.english") },
            ]}
            className="w-full"
            buttonClassName="panel-input min-h-[38px] justify-between rounded-xl px-3.5 py-1.5 text-[12.5px] font-semibold"
            dropdownClassName="left-auto right-0 z-[700] min-w-[190px]"
          />
        </div>
      </div>
    </div>
  );
}
