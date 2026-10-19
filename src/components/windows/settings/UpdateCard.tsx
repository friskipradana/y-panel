import { useState } from "react";
import { ArrowUpCircle, Check, Copy, ExternalLink, LoaderCircle, RefreshCw, Server, Terminal } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getUpdateInfo, getUpdateStatus, applyUpdate } from "@/api/system";
import { copyTextToClipboard } from "@/api/agent";
import { alertLib } from "@/lib/alert";
import { toast } from "sonner";
import { useUpdateProgress } from "@/store/updateStore";

interface UpdateCardProps {
  systemSettings?: {
    osName: string;
    kernel: string;
    dnsMode: string;
    managedConfigPath?: string;
  };
  bare?: boolean;
}

// The version of Reneo, whether a newer one is out, and how to take it
export function UpdateCard({ systemSettings, bare = false }: UpdateCardProps = {}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const showUpdateProgress = useUpdateProgress((s) => s.show);

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
    <div className={bare ? "flex flex-col gap-2.5" : "panel-shell-card settings-card !p-3.5 !gap-2.5"}>
      {/* Top: Host System details + Check update action */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Server className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0" strokeWidth={1.75} />
          {systemSettings ? (
            <>
              <span className="text-[13px] font-semibold text-[var(--win-text)] capitalize">
                {systemSettings.osName}
              </span>
              <span className="font-mono text-[10.5px] text-[var(--text-secondary)] px-1.5 py-0.5 rounded bg-[var(--panel-surface-hover)] border border-[var(--win-border)]">
                {systemSettings.kernel}
              </span>
              <span className="font-mono text-[10.5px] text-[var(--text-secondary)] px-1.5 py-0.5 rounded bg-[var(--panel-surface-hover)] border border-[var(--win-border)]">
                DNS: <strong className="text-[var(--win-text)] font-semibold">{systemSettings.dnsMode}</strong>
              </span>
            </>
          ) : (
            <span className="text-[13px] font-semibold text-[var(--win-text)]">
              {t("settings.update.title")}
            </span>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleCheckUpdate}
          icon={<RefreshCw size={12} />}
          loading={isRefreshing}
          className="!h-7 px-2.5 text-[11.5px]"
        >
          {isRefreshing ? t("settings.update.checking") : t("settings.update.checkNow")}
        </Button>
      </div>

      {/* Version Status Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--win-border)]">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <ArrowUpCircle className="h-3.5 w-3.5 text-[var(--panel-primary-text)] shrink-0" strokeWidth={1.75} />
          <span className="text-[12.5px] font-semibold text-[var(--win-text)]">
            Reneo <strong className="font-mono text-[var(--panel-primary-text)]">v{updateInfo?.current || "..."}</strong>
          </span>
          <Badge size="sm" tone={updateInfo?.available ? "warning" : "success"} dot>
            {updateInfo?.available ? t("settings.update.updateAvailable") : t("settings.update.upToDate")}
          </Badge>
          <span className="font-mono text-[11px] text-[var(--text-secondary)]">
            {updateInfo?.latest ? `v${updateInfo.latest}` : ""}
            {updateInfo?.checkedAt && ` · ${new Date(updateInfo.checkedAt).toLocaleTimeString()}`}
          </span>
        </div>

        {updateInfo?.releaseUrl && (
          <a
            href={updateInfo.releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-[var(--panel-primary-text)] hover:underline font-medium shrink-0"
          >
            <span>{t("settings.update.releaseNotes")}</span>
            <ExternalLink size={11} />
          </a>
        )}
      </div>

      {updateInfo?.available && (
        <div className="space-y-2 pt-1 border-t border-[var(--win-border)]">
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[var(--panel-surface-hover)] border border-[var(--win-border)]">
            <div className="flex items-center gap-2 font-mono text-[11.5px] text-[var(--win-text)] overflow-x-auto">
              <Terminal size={12} className="text-[var(--text-secondary)] shrink-0" />
              <span>sudo reneo update</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={handleCopyCli}
              className="shrink-0 h-6 px-2 text-[10.5px]"
              icon={copied ? <Check size={11} className="text-[var(--panel-success-text)]" /> : <Copy size={11} />}
            >
              {copied ? t("settings.update.copied") : t("common.copy")}
            </Button>
          </div>

          {updateInfo?.canApply && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="primary"
                onClick={handleApplyUpdate}
                icon={<ArrowUpCircle size={12} />}
                loading={applyMutation.isPending || statusQuery.data?.state === "running"}
                className="!h-7 px-3 text-[11.5px]"
              >
                {applyMutation.isPending || statusQuery.data?.state === "running"
                  ? t("settings.update.applying")
                  : t("settings.update.apply")}
              </Button>
            </div>
          )}
        </div>
      )}


      {statusQuery.data?.state === "failed" ? (
        <div className="p-2.5 rounded-md border border-[var(--panel-danger-border)] bg-[var(--panel-danger-bg)] text-[var(--panel-danger-text)] text-[11.5px] space-y-1">
          <div className="font-semibold">{t("settings.update.statusFailed")}</div>
          {statusQuery.data.log && statusQuery.data.log.length > 0 && (
            <pre className="panel-mono max-h-20 overflow-y-auto whitespace-pre-wrap rounded bg-[var(--panel-code-bg)] p-1.5 text-[10.5px] text-[var(--panel-code-text)]">
              {statusQuery.data.log.slice(-6).join("\n")}
            </pre>
          )}
        </div>
      ) : null}

      {statusQuery.data?.state === "running" && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--panel-warning-text)]/30 bg-[var(--panel-warning-bg)] p-2.5 text-[11.5px] text-[var(--panel-warning-text)]">
          <div className="flex items-center gap-2 font-medium">
            <LoaderCircle size={14} className="animate-spin shrink-0" />
            <span>{t("settings.update.statusRunning")}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={showUpdateProgress}
            className="!h-6 !px-2.5 text-[10.5px] shrink-0"
          >
            {t("settings.update.viewProgress")}
          </Button>
        </div>
      )}
    </div>
  );
}
