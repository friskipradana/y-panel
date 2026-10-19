import { Copy, Wifi } from "lucide-react";
import { toast } from "sonner";
import { copyTextToClipboard } from "@/api/agent";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import type { NotificationSettings } from "../../hooks/useNotificationSettings";

// The addresses a phone sends to, and the shape of what it sends
export function ListenerEndpoints({ listener }: { listener: NotificationSettings }) {
  const { t } = useI18n();
  const { listenerWebhookUrl, listenerSocketUrl } = listener;

  const endpoints = [
    { key: "webhook", label: t("settings.listener.stepSendNotification"), method: "POST", tone: "success" as const, url: listenerWebhookUrl, copy: t("settings.listener.copyUrl") },
    { key: "socket", label: t("settings.listener.stepRealtimeAdmin"), method: "WS", tone: "info" as const, url: listenerSocketUrl, copy: t("settings.listener.copyWs") },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <Wifi className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <h3 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{t("settings.listener.endpointsTitle")}</h3>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t("settings.listener.endpointsSubtitle")}</p>
          </div>
        </div>
        <ul className="divide-y divide-[var(--win-border)] overflow-hidden rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)]">
          {endpoints.map((endpoint) => (
            <li key={endpoint.key} className="grid items-center gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto]">
              <span className="flex items-center gap-2">
                <Badge tone={endpoint.tone} size="sm" className="font-mono text-[9.5px]">
                  {endpoint.method}
                </Badge>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{endpoint.label}</span>
              </span>
              <code className="panel-mono min-w-0 break-all text-[11.5px] text-[var(--win-text)]">{endpoint.url}</code>
              <IconButton label={endpoint.copy} onClick={() => void copyTextToClipboard(endpoint.url).then(() => toast.success(t("common.copied")))}>
                <Copy className="h-3.5 w-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      </div>

      <details className="text-[11.5px] text-[var(--text-secondary)]">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-[var(--win-text)]">{t("settings.listener.schemaTitle")}</summary>
        <p className="mt-1 leading-relaxed">{t("settings.listener.schemaSubtitle")}</p>
        <div className="mt-2.5">
          <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{t("settings.listener.webhookBodyTitle")}</div>
            <pre className="panel-mono overflow-x-auto rounded border border-[var(--win-border)] bg-[var(--panel-code-bg)] p-2.5 text-[11px] leading-relaxed text-[var(--panel-code-text)]">{`Header:
X-API-Key: <apiKey device>

Body:
{
  "deviceId": "poco-m4-pro",
  "packageName": "id.dana",
  "appName": "DANA",
  "title": "${t("settings.listener.exampleTitle")}",
  "text": "${t("settings.listener.exampleText")}",
  "amountDetected": "25000"
}`}</pre>
            <p className="mt-2 text-[10.5px] leading-relaxed">
              {t("settings.listener.webhookBodyHelpStart")} <strong className="text-[var(--win-text)]">X-API-Key</strong> {t("settings.listener.webhookBodyHelpEnd")}{" "}
              <code className="panel-mono rounded border border-[var(--win-border)] bg-[var(--panel-surface-hover)] px-1 text-[10.5px] text-[var(--win-text)]">?api_key=...</code>
            </p>
          </div>
        </div>
      </details>

    </div>
  );
}
