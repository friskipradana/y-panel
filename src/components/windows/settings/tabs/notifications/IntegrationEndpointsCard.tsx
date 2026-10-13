import { Copy, Wifi } from "lucide-react";
import { copyTextToClipboard } from "@/api/agent";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useI18n } from "@/lib/i18n";
import type { NotificationSettings } from "../../hooks/useNotificationSettings";
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"

export function IntegrationEndpointsCard({ listener }: { listener: NotificationSettings }) {
  const { t } = useI18n();
  const {
    listenerRegisterUrl,
    listenerWebhookUrl,
    listenerSocketUrl,
  } = listener;

  return (
    <div className="panel-shell-card p-4.5 flex flex-col gap-3.5">
      <SectionHeader
        icon={<Wifi />}
        title={t("settings.listener.endpointsTitle")}
        subtitle={t("settings.listener.endpointsSubtitle")}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Step 1: Register */}
        <div className="p-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col justify-between gap-2.5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                {t("settings.listener.stepRegisterDevice")}
              </span>
              <Badge tone="success" className="text-[9.5px] font-mono font-bold">
                POST
              </Badge>
            </div>
            <code className="panel-mono mt-2 block break-all text-[11px] text-[var(--win-text)] bg-[var(--panel-surface-hover)] p-2 rounded-lg border border-[var(--win-border)]">
              {listenerRegisterUrl}
            </code>
          </div>
          <Button
            type="button" variant="ghost" className="w-full justify-center rounded-lg py-1.5 text-[11.5px] font-semibold flex items-center gap-1.5"
            onClick={() =>
              void copyTextToClipboard(listenerRegisterUrl)
            }
          >
            <Copy size={12} /> {t("settings.listener.copyUrl")}
          </Button>
        </div>

        {/* Step 2: Send Webhook */}
        <div className="p-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col justify-between gap-2.5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                {t("settings.listener.stepSendNotification")}
              </span>
              <Badge tone="success" className="text-[9.5px] font-mono font-bold">
                POST
              </Badge>
            </div>
            <code className="panel-mono mt-2 block break-all text-[11px] text-[var(--win-text)] bg-[var(--panel-surface-hover)] p-2 rounded-lg border border-[var(--win-border)]">
              {listenerWebhookUrl}
            </code>
          </div>
          <Button
            type="button" variant="ghost" className="w-full justify-center rounded-lg py-1.5 text-[11.5px] font-semibold flex items-center gap-1.5"
            onClick={() =>
              void copyTextToClipboard(listenerWebhookUrl)
            }
          >
            <Copy size={12} /> {t("settings.listener.copyUrl")}
          </Button>
        </div>

        {/* Step 3: Realtime Admin Stream */}
        <div className="p-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col justify-between gap-2.5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                {t("settings.listener.stepRealtimeAdmin")}
              </span>
              <Badge tone="info" className="text-[9.5px] font-mono font-bold">
                WS
              </Badge>
            </div>
            <code className="panel-mono mt-2 block break-all text-[11px] text-[var(--win-text)] bg-[var(--panel-surface-hover)] p-2 rounded-lg border border-[var(--win-border)]">
              {listenerSocketUrl}
            </code>
          </div>
          <Button
            type="button" variant="ghost" className="w-full justify-center rounded-lg py-1.5 text-[11.5px] font-semibold flex items-center gap-1.5"
            onClick={() =>
              void copyTextToClipboard(listenerSocketUrl)
            }
          >
            <Copy size={12} /> {t("settings.listener.copyWs")}
          </Button>
        </div>
      </div>
    </div>
  );
}
