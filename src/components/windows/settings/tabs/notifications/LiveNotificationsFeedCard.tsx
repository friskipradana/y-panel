import { BadgeCheck, LoaderCircle, RefreshCcw } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useI18n } from "@/lib/i18n";
import type { NotificationSettings } from "../../hooks/useNotificationSettings";
import { Button } from "@/components/ui/Button"

export function LiveNotificationsFeedCard({ listener }: { listener: NotificationSettings }) {
  const { t } = useI18n();
  const {
    capturedNotificationsQuery,
    capturedNotifications,
  } = listener;

  return (
    <div className="panel-shell-card p-4.5 flex flex-col justify-between">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <SectionHeader
            icon={<BadgeCheck />}
            title={t("settings.listener.latestNotifications")}
          />
          <Button
            id="notifications-refresh"
            type="button"
            onClick={() =>
              void capturedNotificationsQuery.refetch()
            } variant="ghost" className="rounded-lg px-2.5 py-1 text-[11.5px] font-semibold flex items-center gap-1.5"
          >
            <RefreshCcw
              size={11}
              className={
                capturedNotificationsQuery.isFetching
                  ? "animate-spin"
                  : ""
              }
            />
            {t("common.refresh")}
          </Button>
        </div>

        {capturedNotificationsQuery.isLoading ? (
          <div className="panel-loading min-h-[100px]">
            <LoaderCircle size={16} className="animate-spin" />
          </div>
        ) : !capturedNotifications.length ? (
          <div className="panel-empty min-h-[140px] text-[12px] flex flex-col items-center justify-center p-4 rounded-xl border border-dashed border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
            <BadgeCheck size={24} className="opacity-40 mb-1" />
            <span>{t("settings.listener.noNotifications")}</span>
          </div>
        ) : (
          <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto pr-1">
            {capturedNotifications.slice(0, 10).map((notif) => (
              <div
                key={notif.id}
                className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3 text-[12px]"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-bold text-[var(--win-text)]">
                    {notif.appName || notif.packageName}
                  </span>
                  <span className="panel-mono text-[10.5px] text-[var(--text-secondary)]">
                    {new Date(
                      notif.receivedAt || notif.createdAt,
                    ).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-[12px] text-[var(--win-text)] font-medium">
                  {notif.title}
                </div>
                <div className="text-[11.5px] text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                  {notif.body}
                </div>
                {notif.amountDetected ? (
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-400">
                    <BadgeCheck size={11} />
                    Rp{" "}
                    {Number(notif.amountDetected).toLocaleString(
                      "id-ID",
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
