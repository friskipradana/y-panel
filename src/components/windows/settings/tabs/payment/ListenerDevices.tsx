import { BadgeCheck, RefreshCcw, Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatDateTimeID } from "@/lib/datetime";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ListRow } from "@/components/ui/ListRow";
import { ErrorState, LoadingState } from "@/components/ui/states";
import type { NotificationSettings } from "../../hooks/useNotificationSettings";

// What the phones sent last, live
export function ListenerDevices({ listener, bare }: { listener: NotificationSettings; bare?: boolean }) {
  const { t } = useI18n();
  const { capturedWS, capturedNotificationsQuery, capturedNotifications } = listener;

  return (
    <div className={bare ? "flex flex-col gap-3.5" : "panel-shell-card settings-card !p-3.5 !gap-3.5"}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <Smartphone className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{t("settings.listener.title")}</h2>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t("settings.listener.subtitle")}</p>
          </div>
        </div>
        <Badge tone={capturedWS.connected ? "success" : "warning"} dot size="sm" className="shrink-0 self-start">
          {capturedWS.connected ? t("settings.listener.realtimeConnected") : t("settings.listener.realtimeReconnecting")}
        </Badge>
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--win-border)]" />

      <div className="space-y-3">
        <div>
          {/* Right Column: Latest Notifications */}
          <div className="space-y-2">
            <div className="flex min-h-7 items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BadgeCheck size={13} className="text-[var(--panel-primary-text)]" />
                <span className="text-[12.5px] font-semibold text-[var(--win-text)]">{t("settings.listener.latestNotifications")}</span>
              </div>
              <Button
                id="notifications-refresh"
                type="button"
                variant="ghost"
                size="sm"
                icon={<RefreshCcw className="h-3 w-3" />}
                loading={capturedNotificationsQuery.isFetching && !capturedNotificationsQuery.isLoading}
                onClick={() => void capturedNotificationsQuery.refetch()}
                className="!h-7 text-[11px]"
              >
                {t("common.refresh")}
              </Button>
            </div>

            <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)]/30 max-h-[320px] min-h-[160px] overflow-y-auto">
              {capturedNotificationsQuery.isLoading ? (
                <LoadingState>{t("settings.listener.loadingNotifications")}</LoadingState>
              ) : capturedNotificationsQuery.isError ? (
                <ErrorState
                  title={t("settings.listener.notificationsFailed")}
                  hint={t("settings.listener.retryHint")}
                  action={
                    <Button variant="primary" size="sm" onClick={() => void capturedNotificationsQuery.refetch()}>
                      {t("common.retry")}
                    </Button>
                  }
                />
              ) : capturedNotifications.length === 0 ? (
                <div className="p-6 text-center flex h-full flex-col items-center justify-center">
                  <BadgeCheck className="h-8 w-8 text-[var(--text-muted)] opacity-50 mb-2" strokeWidth={1.5} />
                  <p className="text-[11.5px] text-[var(--text-secondary)] max-w-xs leading-relaxed">{t("settings.listener.noNotifications")}</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--win-border)]/50">
                  {capturedNotifications.slice(0, 10).map((notif) => (
                    <ListRow
                      key={notif.id}
                      title={<span className="truncate font-medium text-[12px]">{notif.appName || notif.packageName}</span>}
                      tag={
                        <>
                          <Badge tone="neutral" size="sm" className="panel-mono">
                            {notif.deviceId}
                          </Badge>
                          {notif.amountDetected ? (
                            <Badge tone="success" size="sm">
                              Rp {Number(notif.amountDetected).toLocaleString("id-ID")}
                            </Badge>
                          ) : null}
                        </>
                      }
                      actions={
                        <span className="panel-mono text-[10.5px] text-[var(--text-secondary)]">
                          {formatDateTimeID(notif.receivedAt || notif.createdAt)}
                        </span>
                      }
                      details={
                        <span className="line-clamp-2 text-[11.5px]">
                          <strong className="font-medium text-[var(--win-text)]">{notif.title}</strong> {notif.body}
                        </span>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Android Permission / How It Works Callout */}
        <div className="flex items-start gap-2.5 rounded-lg border border-[var(--panel-info-border,var(--win-border))] bg-[var(--panel-info-bg,var(--panel-surface))]/60 p-3 text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
          <Smartphone size={15} className="mt-0.5 shrink-0 text-[var(--panel-info-text)]" strokeWidth={1.75} />
          <div>
            <strong className="text-[var(--win-text)] font-semibold">{t("settings.listener.howItWorksTitle")}</strong>{" "}
            {t("settings.listener.howItWorksStart")}{" "}
            <code className="panel-mono text-[11px] text-[var(--win-text)] bg-[var(--panel-surface-hover)] px-1.5 py-0.5 rounded border border-[var(--win-border)]">
              NotificationListener
            </code>{" "}
            {t("settings.listener.howItWorksEnd")}
          </div>
        </div>
      </div>
    </div>
  );
}
