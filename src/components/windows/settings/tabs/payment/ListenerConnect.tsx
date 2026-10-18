import { Fragment } from "react";
import { BadgeCheck, Copy, Key, RefreshCcw, Save, Wifi } from "lucide-react";
import { copyTextToClipboard } from "@/api/agent";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import type { NotificationSettings } from "../../hooks/useNotificationSettings";
import type { SettingsTabKey } from "../../constants";

// An address that may break after a slash, so a long one wraps at a readable place
function UrlText({ value }: { value: string }) {
  return (
    <>
      {value.split(/(?<=\/)/).map((part, index) => (
        <Fragment key={index}>
          {part}
          <wbr />
        </Fragment>
      ))}
    </>
  );
}

// How a phone is connected: the addresses, the key of a device and the shape of what it sends
export function ListenerConnect({ listener, setActiveTab }: { listener: NotificationSettings; setActiveTab: (tab: SettingsTabKey) => void }) {
  const { t } = useI18n();
  const {
    listenerRegisterUrl,
    listenerWebhookUrl,
    listenerSocketUrl,
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
    <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
      <div className="space-y-3.5">
        {/* Step 1: Endpoint Integrasi */}
        <div className="space-y-2.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <Wifi className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
            <div>
              <h3 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{t("settings.listener.endpointsTitle")}</h3>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t("settings.listener.endpointsSubtitle")}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {/* 1. Register */}
            <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)]/50 p-3 flex flex-col justify-between gap-2">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {t("settings.listener.stepRegisterDevice")}
                  </span>
                  <Badge tone="success" size="sm" className="font-mono text-[9.5px]">
                    POST
                  </Badge>
                </div>
                <code className="panel-mono mt-1.5 block break-words text-[11px] text-[var(--win-text)] bg-[var(--panel-surface-hover)] p-2 rounded border border-[var(--win-border)]">
                  <UrlText value={listenerRegisterUrl} />
                </code>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                block
                className="!h-7 text-[11px]"
                onClick={() => void copyTextToClipboard(listenerRegisterUrl)}
              >
                <Copy size={11} /> {t("settings.listener.copyUrl")}
              </Button>
            </div>

            {/* 2. Webhook */}
            <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)]/50 p-3 flex flex-col justify-between gap-2">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {t("settings.listener.stepSendNotification")}
                  </span>
                  <Badge tone="success" size="sm" className="font-mono text-[9.5px]">
                    POST
                  </Badge>
                </div>
                <code className="panel-mono mt-1.5 block break-words text-[11px] text-[var(--win-text)] bg-[var(--panel-surface-hover)] p-2 rounded border border-[var(--win-border)]">
                  <UrlText value={listenerWebhookUrl} />
                </code>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                block
                className="!h-7 text-[11px]"
                onClick={() => void copyTextToClipboard(listenerWebhookUrl)}
              >
                <Copy size={11} /> {t("settings.listener.copyUrl")}
              </Button>
            </div>

            {/* 3. Realtime Admin */}
            <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)]/50 p-3 flex flex-col justify-between gap-2">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {t("settings.listener.stepRealtimeAdmin")}
                  </span>
                  <Badge tone="info" size="sm" className="font-mono text-[9.5px]">
                    WS
                  </Badge>
                </div>
                <code className="panel-mono mt-1.5 block break-words text-[11px] text-[var(--win-text)] bg-[var(--panel-surface-hover)] p-2 rounded border border-[var(--win-border)]">
                  <UrlText value={listenerSocketUrl} />
                </code>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                block
                className="!h-7 text-[11px]"
                onClick={() => void copyTextToClipboard(listenerSocketUrl)}
              >
                <Copy size={11} /> {t("settings.listener.copyWs")}
              </Button>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* Step 2: Kelola API Key Listener */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
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
              <Field
                label={t("settings.listener.packageFilter")}
                htmlFor="notification-device-package-filter"
                hint={t("settings.listener.packageHint")}
              >
                <TextInput
                  id="notification-device-package-filter"
                  value={listenerPackageFilter}
                  onChange={(e) => setListenerPackageFilter(e.target.value)}
                  placeholder={t("settings.listener.packageFilterPlaceholder")}
                  className="!h-8 px-2.5 text-[12px]"
                />
              </Field>
            </div>
          </div>

          <p className="text-[11px] text-[var(--text-secondary)]">{t("settings.listener.apiKeyHelp")}</p>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
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
              variant="default"
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

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* Step 3: Referensi Payload & Skema */}
        <div className="space-y-2.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <Copy className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
            <div>
              <h3 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{t("settings.listener.schemaTitle")}</h3>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t("settings.listener.schemaSubtitle")}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
            <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)]/50 p-3">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {t("settings.listener.registerBodyTitle")}
              </div>
              <pre className="panel-mono overflow-x-auto rounded bg-[var(--panel-code-bg)] p-2.5 text-[11px] leading-relaxed text-[var(--panel-code-text)] border border-[var(--win-border)]">{`{
  "deviceId": "wimboro-device-001",
  "apiKey": "custom-api-key",
  "packageFilter": ["com.whatsapp", "id.dana", "com.gojek.gopay"]
}`}</pre>
              <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--text-secondary)]">
                {t("settings.listener.registerBodyHelpStart")} <strong className="text-[var(--win-text)]">apiKey</strong>{" "}
                {t("settings.listener.registerBodyHelpEnd")}
              </p>
            </div>

            <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)]/50 p-3">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {t("settings.listener.webhookBodyTitle")}
              </div>
              <pre className="panel-mono overflow-x-auto rounded bg-[var(--panel-code-bg)] p-2.5 text-[11px] leading-relaxed text-[var(--panel-code-text)] border border-[var(--win-border)]">{`Header:
X-API-Key: <apiKey device>

Body:
{
  "packageName": "id.dana",
  "appName": "DANA",
  "title": "${t("settings.listener.exampleTitle")}",
  "text": "${t("settings.listener.exampleText")}",
  "amountDetected": "25000"
}`}</pre>
              <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--text-secondary)]">
                {t("settings.listener.webhookBodyHelpStart")} <strong className="text-[var(--win-text)]">X-API-Key</strong>{" "}
                {t("settings.listener.webhookBodyHelpEnd")}{" "}
                <code className="panel-mono text-[10.5px] text-[var(--win-text)] bg-[var(--panel-surface-hover)] px-1 rounded border border-[var(--win-border)]">
                  ?api_key=...
                </code>
              </p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* Step 4: Token MCP Navigation Callout */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[12px] text-[var(--win-text)]">
            <Key size={14} className="text-[var(--panel-primary-text)] shrink-0" />
            <span>{t("settings.listener.tokenNotice")}</span>
          </div>
          <Button type="button" onClick={() => setActiveTab("api_tokens")} variant="default" size="sm" className="!h-8 px-3.5 text-[12px] shrink-0">
            {t("settings.listener.openTokens")}
          </Button>
        </div>
      </div>
    </div>
  );
}
