import { useState } from "react";
import {
  ArrowUpCircle,
  Check,
  Copy,
  ExternalLink,
  Globe2,
  LoaderCircle,
  RefreshCw,
  Save,
  Server,
  Sparkles,
  Terminal,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Select } from "@/components/ui/Select";
import { useI18n, type Language } from "@/lib/i18n";
import type { HostSettings } from "../hooks/useHostSettings";
import { FieldLabel, TimezoneSelect, DnsEditor } from "../SettingsPrimitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { IconBadge } from "@/components/ui/IconBadge";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { getUpdateInfo, getUpdateStatus, applyUpdate } from "@/api/system";
import { alertLib } from "@/lib/alert";

export function GeneralTab({ host, systemSettings }: { host: HostSettings; systemSettings: NonNullable<HostSettings["query"]["data"]> }) {
  const { language, setLanguage, t } = useI18n();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const updateQuery = useQuery({
    queryKey: ["system-update"],
    queryFn: () => getUpdateInfo(false),
    staleTime: 5 * 60 * 1000,
  });

  const statusQuery = useQuery({
    queryKey: ["system-update-status"],
    queryFn: getUpdateStatus,
    refetchInterval: (query) => (query.state.data?.state === "running" ? 3000 : false),
  });

  const applyMutation = useMutation({
    mutationFn: (targetVersion?: string) => applyUpdate(targetVersion),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["system-update-status"] });
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : err instanceof Error
            ? err.message
            : String(err);
      alertLib.fire(
        t("settings.update.statusFailed"),
        message || t("settings.update.statusFailed"),
        "error"
      );
    },
  });

  const handleCheckUpdate = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.fetchQuery({
        queryKey: ["system-update"],
        queryFn: () => getUpdateInfo(true),
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyCli = async () => {
    try {
      await navigator.clipboard.writeText("sudo reneo update");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleApplyUpdate = async () => {
    const confirmed = await alertLib.confirm(
      t("settings.update.confirmTitle"),
      t("settings.update.confirmDesc"),
      t("settings.update.apply"),
      t("common.cancel"),
      "warning",
      "settings"
    );
    if (confirmed) {
      applyMutation.mutate(updateQuery.data?.latest);
    }
  };

  const updateInfo = updateQuery.data;

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
              DNS: <strong className="font-semibold text-[var(--win-text)]">{systemSettings.dnsMode}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Reneo Version & Update Card */}
      <div className="panel-shell-card p-4.5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader
            icon={<ArrowUpCircle />}
            title={t("settings.update.title")}
            subtitle={t("settings.update.subtitle")}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={handleCheckUpdate}
            disabled={isRefreshing || updateQuery.isFetching}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-xl border border-[var(--win-border)]"
          >
            <RefreshCw size={12} className={isRefreshing || updateQuery.isFetching ? "animate-spin" : ""} />
            <span>{t("settings.update.checkNow")}</span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-xl bg-[var(--panel-surface-hover)] border border-[var(--win-border)]">
          <div className="flex items-center gap-3">
            <IconBadge size="md" tone={updateInfo?.available ? "warning" : "success"}>
              <Sparkles />
            </IconBadge>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-[var(--win-text)]">
                  Reneo <span className="font-mono text-[var(--panel-primary-text)] font-bold">v{updateInfo?.current || "..."}</span>
                </span>
                <span className={`panel-badge ${updateInfo?.available ? "panel-badge--warning" : "panel-badge--success"}`}>
                  <span className="panel-status-dot" />
                  {updateInfo?.available ? t("settings.update.updateAvailable") : t("settings.update.upToDate")}
                </span>
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                {updateInfo?.latest ? `${t("settings.update.latestVersion")}: v${updateInfo.latest}` : t("settings.update.checking")}
                {updateInfo?.checkedAt && ` • ${t("settings.update.lastChecked")}: ${new Date(updateInfo.checkedAt).toLocaleTimeString()}`}
              </div>
            </div>
          </div>

          {updateInfo?.releaseUrl && (
            <a
              href={updateInfo.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] text-[var(--panel-primary-text)] hover:underline font-medium"
            >
              <span>{t("settings.update.releaseNotes")}</span>
              <ExternalLink size={12} />
            </a>
          )}
        </div>

        {updateInfo?.available && (
          <div className="space-y-3 pt-1">
            <div className="text-[12px] text-[var(--text-secondary)]">
              {t("settings.update.cliHint")}
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--panel-surface)] border border-[var(--win-border)]">
              <div className="flex items-center gap-2 font-mono text-[12px] text-[var(--win-text)] overflow-x-auto">
                <Terminal size={13} className="text-[var(--text-secondary)] shrink-0" />
                <span>sudo reneo update</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={handleCopyCli}
                className="shrink-0 flex items-center gap-1 text-[11.5px] px-2.5 py-1 rounded-lg"
              >
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                <span>{copied ? t("settings.update.copied") : t("common.copy")}</span>
              </Button>
            </div>

            {updateInfo?.canApply && (
              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleApplyUpdate}
                  disabled={applyMutation.isPending || statusQuery.data?.state === "running"}
                  className="rounded-xl px-4 py-2 text-[12.5px] font-semibold flex items-center gap-2"
                >
                  {applyMutation.isPending || statusQuery.data?.state === "running" ? (
                    <LoaderCircle size={13} className="animate-spin" />
                  ) : (
                    <ArrowUpCircle size={13} />
                  )}
                  <span>
                    {applyMutation.isPending || statusQuery.data?.state === "running"
                      ? t("settings.update.applying")
                      : t("settings.update.apply")}
                  </span>
                </Button>
              </div>
            )}
          </div>
        )}

        {statusQuery.data?.state === "running" && (
          <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[12px] space-y-1.5">
            <div className="flex items-center gap-2 font-medium">
              <LoaderCircle size={13} className="animate-spin" />
              <span>{t("settings.update.statusRunning")}</span>
            </div>
            {statusQuery.data.log && statusQuery.data.log.length > 0 && (
              <pre className="p-2 rounded bg-black/40 text-[11px] font-mono text-zinc-300 max-h-24 overflow-y-auto whitespace-pre-wrap">
                {statusQuery.data.log.join("\n")}
              </pre>
            )}
          </div>
        )}
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
