import { BadgeCheck, RefreshCcw } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useI18n } from "@/lib/i18n";
import type { NotificationSettings } from "../../hooks/useNotificationSettings";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ListRow } from "@/components/ui/ListRow";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

// The last notifications the phones sent, newest first
export function LiveNotificationsFeedCard({ listener }: { listener: NotificationSettings }) {
  const { t } = useI18n();
  const { capturedNotificationsQuery: query, capturedNotifications } = listener;

  return (
    <section className="panel-shell-card settings-card">
      <SectionHeader
        icon={<BadgeCheck />}
        title={t("settings.listener.latestNotifications")}
        actions={
          <Button id="notifications-refresh" type="button" variant="ghost" icon={<RefreshCcw className="h-3.5 w-3.5" />} loading={query.isFetching && !query.isLoading} onClick={() => void query.refetch()}>
            {t("common.refresh")}
          </Button>
        }
      />

      {query.isLoading ? (
        <LoadingState>{t("settings.listener.loadingNotifications")}</LoadingState>
      ) : query.isError ? (
        <ErrorState title={t("settings.listener.notificationsFailed")} hint={t("settings.listener.retryHint")} />
      ) : capturedNotifications.length === 0 ? (
        <EmptyState icon={<BadgeCheck />}>{t("settings.listener.noNotifications")}</EmptyState>
      ) : (
        <div className="panel-table-container max-h-[300px] overflow-y-auto">
          {capturedNotifications.slice(0, 10).map((notif) => (
            <ListRow
              key={notif.id}
              title={<span className="truncate">{notif.appName || notif.packageName}</span>}
              tag={notif.amountDetected ? <Badge tone="success">Rp {Number(notif.amountDetected).toLocaleString("id-ID")}</Badge> : undefined}
              actions={<span className="panel-mono text-[10.5px] text-[var(--text-secondary)]">{new Date(notif.receivedAt || notif.createdAt).toLocaleTimeString()}</span>}
              details={<span className="line-clamp-2"><strong className="font-medium text-[var(--win-text)]">{notif.title}</strong> {notif.body}</span>}
            />
          ))}
        </div>
      )}
    </section>
  );
}
