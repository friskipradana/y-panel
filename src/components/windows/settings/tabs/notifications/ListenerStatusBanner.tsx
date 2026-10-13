import { Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { NotificationSettings } from "../../hooks/useNotificationSettings";
import { IconBadge } from "@/components/ui/IconBadge";

export function ListenerStatusBanner({ listener }: { listener: NotificationSettings }) {
  const { t } = useI18n();
  const {
    capturedWS,
  } = listener;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] shadow-xs">
      <div className="flex items-center gap-3">
        <IconBadge size="md" tone="primary">
          <Smartphone />
        </IconBadge>
        <div>
          <div className="text-[13.5px] font-bold text-[var(--win-text)]">
            {t("settings.listener.title")}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 max-w-[540px]">
            {t("settings.listener.subtitle")}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div
          className={`inline-flex items-center gap-1.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface-hover)] px-3 py-1.5 text-[11.5px] font-medium ${
            capturedWS.connected
              ? "text-[var(--panel-success-text)]"
              : "text-amber-500"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              capturedWS.connected
                ? "bg-[var(--panel-success-text)] animate-pulse"
                : "bg-amber-500"
            }`}
          />
          <span>
            {capturedWS.connected
              ? t("settings.listener.realtimeConnected")
              : t("settings.listener.realtimeReconnecting")}
          </span>
        </div>
      </div>
    </div>
  );
}
