import { useState } from "react";
import { ArrowUpCircle, Check, CircleArrowUp, CircleCheck, Copy, ExternalLink, LoaderCircle, RefreshCw, Terminal } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { IconBadge } from "@/components/ui/IconBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getUpdateInfo, getUpdateStatus, applyUpdate } from "@/api/system";
import { copyTextToClipboard } from "@/api/agent";
import { alertLib } from "@/lib/alert";
import { toast } from "sonner";
import { useUpdateProgress } from "@/store/updateStore";

const DONE_SEEN_KEY = "reneo-update-done-seen";

function doneSeen(version: string): boolean {
  try {
    return window.localStorage.getItem(DONE_SEEN_KEY) === version;
  } catch {
    return false;
  }
}

// The version of Reneo, whether a newer one is out, and how to take it
export function UpdateCard() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const showUpdateProgress = useUpdateProgress((s) => s.show);
  const [seenVersion, setSeenVersion] = useState<string | null>(null);

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
      showUpdateProgress();
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
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const info = await queryClient.fetchQuery({
        queryKey: ["system-update"],
        queryFn: () => getUpdateInfo(true),
        staleTime: 0,
      });
      if (info.error) toast.error(t("settings.update.checkFailed"), { description: info.error });
      else if (info.available) toast.info(t("settings.update.foundToast", { version: info.latest }));
      else toast.success(t("settings.update.upToDateToast"));
    } catch {
      toast.error(t("settings.update.checkFailed"));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyCli = async () => {
    try {
      // works on plain http too, where navigator.clipboard is unavailable
      if (await copyTextToClipboard("sudo reneo update")) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // the command stays visible in the block above
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
      <div className="panel-shell-card settings-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader
            icon={<ArrowUpCircle />}
            title={t("settings.update.title")}
            subtitle={t("settings.update.subtitle")}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleCheckUpdate}
            icon={<RefreshCw size={14} />}
            loading={isRefreshing}
          >
            {isRefreshing ? t("settings.update.checking") : t("settings.update.checkNow")}
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--win-border)] pt-4">
          <div className="flex items-center gap-3">
            <IconBadge size="md" tone={updateInfo?.available ? "warning" : "success"}>
              {updateInfo?.available ? <CircleArrowUp /> : <CircleCheck />}
            </IconBadge>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-[var(--win-text)]">
                  Reneo <span className="font-mono text-[var(--panel-primary-text)] font-bold">v{updateInfo?.current || "..."}</span>
                </span>
                <Badge tone={updateInfo?.available ? "warning" : "success"} dot>
                  {updateInfo?.available ? t("settings.update.updateAvailable") : t("settings.update.upToDate")}
                </Badge>
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
                className="shrink-0"
                icon={copied ? <Check size={12} className="text-[var(--panel-success-text)]" /> : <Copy size={12} />}
              >
                {copied ? t("settings.update.copied") : t("common.copy")}
              </Button>
            </div>

            {updateInfo?.canApply && (
              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleApplyUpdate}
                  icon={<ArrowUpCircle size={13} />}
                  loading={applyMutation.isPending || statusQuery.data?.state === "running"}
                >
                  {applyMutation.isPending || statusQuery.data?.state === "running"
                    ? t("settings.update.applying")
                    : t("settings.update.apply")}
                </Button>
              </div>
            )}
          </div>
        )}

        {statusQuery.data?.state === "done" && statusQuery.data.to && seenVersion !== statusQuery.data.to && !doneSeen(statusQuery.data.to) ? (
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--panel-success-border)] bg-[var(--panel-success-bg)] text-[var(--panel-success-text)] text-[12px] font-medium">
            <span>{t("settings.update.statusDone", { version: statusQuery.data.to })}</span>
            <Button
              type="button"
              variant="ghost"
              className="shrink-0 px-2.5 py-1 text-[11.5px]"
              onClick={() => {
                const version = statusQuery.data?.to ?? "";
                try {
                  window.localStorage.setItem(DONE_SEEN_KEY, version);
                } catch {
                  // told again next time; harmless
                }
                setSeenVersion(version);
              }}
            >
              {t("common.close")}
            </Button>
          </div>
        ) : null}

        {statusQuery.data?.state === "failed" ? (
          <div className="p-3 rounded-xl border border-[var(--panel-danger-border)] bg-[var(--panel-danger-bg)] text-[var(--panel-danger-text)] text-[12px] space-y-1.5">
            <div className="font-medium">{t("settings.update.statusFailed")}</div>
            {statusQuery.data.log && statusQuery.data.log.length > 0 && (
              <pre className="panel-mono max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[var(--panel-code-bg)] p-2 text-[11px] text-[var(--panel-code-text)]">
                {statusQuery.data.log.slice(-8).join("\n")}
              </pre>
            )}
          </div>
        ) : null}

        {statusQuery.data?.state === "running" && (
          <div className="space-y-1.5 rounded-xl border border-[var(--panel-warning-text)]/30 bg-[var(--panel-warning-bg)] p-3 text-[12px] text-[var(--panel-warning-text)]">
            <div className="flex items-center gap-2 font-medium">
              <LoaderCircle size={13} className="animate-spin" />
              <span>{t("settings.update.statusRunning")}</span>
            </div>
            {statusQuery.data.log && statusQuery.data.log.length > 0 && (
              <pre className="panel-mono max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[var(--panel-code-bg)] p-2 text-[11px] text-[var(--panel-code-text)]">
                {statusQuery.data.log.join("\n")}
              </pre>
            )}
          </div>
        )}
      </div>
  );
}
