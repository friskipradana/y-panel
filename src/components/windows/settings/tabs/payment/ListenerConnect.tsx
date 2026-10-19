import { BadgeCheck, Copy, Key, RefreshCcw, Save, Wifi } from "lucide-react";
import { toast } from "sonner";
import { copyTextToClipboard } from "@/api/agent";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Select } from "@/components/ui/Select";
import type { NotificationSettings } from "../../hooks/useNotificationSettings";
import type { SettingsTabKey } from "../../constants";

// The addresses a phone sends to, and the shape of what it sends
export function ListenerEndpoints({ listener }: { listener: NotificationSettings }) {
  const { t } = useI18n();
  const { listenerRegisterUrl, listenerWebhookUrl, listenerSocketUrl } = listener;

  const endpoints = [
    { key: "register", label: t("settings.listener.stepRegisterDevice"), method: "POST", tone: "success" as const, url: listenerRegisterUrl, copy: t("settings.listener.copyUrl") },
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
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 xl:grid-cols-2">
          <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{t("settings.listener.registerBodyTitle")}</div>
            <pre className="panel-mono overflow-x-auto rounded border border-[var(--win-border)] bg-[var(--panel-code-bg)] p-2.5 text-[11px] leading-relaxed text-[var(--panel-code-text)]">{`{
  "deviceId": "wimboro-device-001",
  "apiKey": "custom-api-key",
  "packageFilter": ["com.whatsapp", "id.dana", "com.gojek.gopay"]
}`}</pre>
            <p className="mt-2 text-[10.5px] leading-relaxed">
              {t("settings.listener.registerBodyHelpStart")} <strong className="text-[var(--win-text)]">apiKey</strong> {t("settings.listener.registerBodyHelpEnd")}
            </p>
          </div>

          <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{t("settings.listener.webhookBodyTitle")}</div>
            <pre className="panel-mono overflow-x-auto rounded border border-[var(--win-border)] bg-[var(--panel-code-bg)] p-2.5 text-[11px] leading-relaxed text-[var(--panel-code-text)]">{`Header:
X-API-Key: <apiKey device>

Body:
{
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

// The key of a device: saving a new one, changing its status and filter, and where the tokens of the panel are
export function ListenerKey({ listener, setActiveTab }: { listener: NotificationSettings; setActiveTab: (tab: SettingsTabKey) => void }) {
  const { t } = useI18n();
  const {
    listenerDeviceId,
    setListenerDeviceId,
    listenerApiKey,
    setListenerApiKey,
    listenerPackageFilter,
    setListenerPackageFilter,
    listenerStatus,
    setListenerStatus,
    registerDeviceMutation,
    updateDeviceMutation,
    handleSaveListenerDevice,
    handleUpdateListenerMetadata,
  } = listener;

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <Key className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
            <div>
              <h3 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{t("settings.listener.manageTitle")}</h3>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t("settings.listener.manageSubtitle")}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<RefreshCcw size={12} />}
            onClick={() => setListenerApiKey(`ypnl_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`)}
            className="!h-7 text-[11.5px] shrink-0"
          >
            {t("settings.listener.generateKey")}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("settings.listener.deviceId")} htmlFor="notification-device-id">
            <TextInput
              id="notification-device-id"
              mono
              value={listenerDeviceId}
              onChange={(e) => setListenerDeviceId(e.target.value)}
              placeholder={t("settings.listener.deviceIdPlaceholder")}
              className="!h-8 px-2.5 text-[12px]"
            />
          </Field>

          <Field label={t("settings.listener.newApiKey")} htmlFor="notification-device-api-key">
            <TextInput
              id="notification-device-api-key"
              type="password"
              mono
              value={listenerApiKey}
              onChange={(e) => setListenerApiKey(e.target.value)}
              placeholder={t("settings.listener.newApiKeyPlaceholder")}
              className="!h-8 px-2.5 text-[12px]"
            />
          </Field>

          <Field label={t("settings.listener.status")}>
            <Select
              id="notification-device-status"
              value={listenerStatus}
              onChange={setListenerStatus}
              options={[
                { value: "active", label: "active" },
                { value: "inactive", label: "inactive" },
                { value: "blocked", label: "blocked" },
              ]}
              buttonClassName="!h-8 px-2.5 text-[12px]"
            />
          </Field>

          <div className="sm:col-span-2 lg:col-span-3">
            <Field label={t("settings.listener.packageFilter")} htmlFor="notification-device-package-filter" hint={t("settings.listener.packageHint")}>
              <TextInput
                id="notification-device-package-filter"
                mono
                value={listenerPackageFilter}
                onChange={(e) => setListenerPackageFilter(e.target.value)}
                placeholder={t("settings.listener.packageFilterPlaceholder")}
                className="!h-8 px-2.5 text-[12px]"
              />
            </Field>
          </div>
        </div>

        <p className="text-[11px] text-[var(--text-secondary)]">{t("settings.listener.apiKeyHelp")}</p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            id="notification-save-api-key"
            type="button"
            variant="primary"
            size="sm"
            icon={<Save size={13} />}
            loading={registerDeviceMutation.isPending}
            onClick={handleSaveListenerDevice}
            className="!h-8 px-3.5 text-[12px]"
          >
            {t("settings.listener.saveApiKey")}
          </Button>
          <Button
            id="notification-update-device-meta"
            type="button"
            variant="outline"
            size="sm"
            icon={<BadgeCheck size={13} />}
            loading={updateDeviceMutation.isPending}
            onClick={handleUpdateListenerMetadata}
            className="!h-8 px-3.5 text-[12px]"
          >
            {t("settings.listener.updateMeta")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<Copy size={12} />}
            onClick={() => void copyTextToClipboard(listenerApiKey)}
            disabled={!listenerApiKey}
            className="!h-8 px-3.5 text-[12px]"
          >
            {t("settings.listener.copyNewKey")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-3 pt-1 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 text-[12px] text-[var(--win-text)]">
          <Key size={14} className="shrink-0 text-[var(--panel-primary-text)]" />
          <span>{t("settings.listener.tokenNotice")}</span>
        </div>
        <Button type="button" onClick={() => setActiveTab("api_tokens")} variant="default" size="sm" className="!h-8 shrink-0 px-3.5 text-[12px]">
          {t("settings.listener.openTokens")}
        </Button>
      </div>
    </div>
  );
}
