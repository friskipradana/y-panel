import { useState } from "react";
import { BadgeCheck, Copy, Key, Pencil, Plug, RefreshCcw, Save, Smartphone, Trash2, Wifi } from "lucide-react";
import { copyTextToClipboard } from "@/api/agent";
import { useI18n } from "@/lib/i18n";
import { formatDateTimeID } from "@/lib/datetime";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ListRow } from "@/components/ui/ListRow";
import { Field, TextInput } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { ErrorState, LoadingState } from "@/components/ui/states";
import type { UiTone } from "@/components/ui/IconBadge";
import type { NotificationSettings } from "../hooks/useNotificationSettings";
import type { SettingsTabKey } from "../constants";

type Section = "devices" | "integration";

const STATUS_TONE: Record<string, UiTone> = {
  active: "success",
  inactive: "neutral",
  blocked: "danger",
};

export function NotificationsTab({
  listener,
  setActiveTab,
}: {
  listener: NotificationSettings;
  setActiveTab: (tab: SettingsTabKey) => void;
}) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>("devices");

  const {
    capturedWS,
    notificationDevicesQuery,
    notificationDevices,
    deleteDeviceMutation,
    handleUseDeviceForEdit,
    handleDeleteListenerDevice,
    capturedNotificationsQuery,
    capturedNotifications,
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
    <div className="space-y-3">
      {/* ── Single Unified Notifications Card ── */}
      <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
        {/* ── Header: Title & Realtime WS Status ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <Smartphone className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">
                {t("settings.listener.title")}
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                {t("settings.listener.subtitle")}
              </p>
            </div>
          </div>
          <Badge tone={capturedWS.connected ? "success" : "warning"} dot size="sm" className="shrink-0">
            {capturedWS.connected ? t("settings.listener.realtimeConnected") : t("settings.listener.realtimeReconnecting")}
          </Badge>
        </div>

        {/* ── Subtabs Selector ── */}
        <div className="pt-0.5">
          <Tabs
            label={t("settings.notifications.sections")}
            value={section}
            onChange={setSection}
            items={[
              { key: "devices", label: t("settings.notifications.sectionDevices"), icon: <Smartphone size={13} /> },
              { key: "integration", label: t("settings.notifications.sectionIntegration"), icon: <Plug size={13} /> },
            ]}
          />
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── SECTION 1: PERANGKAT & UMPAN LANGSUNG ── */}
        {section === "devices" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {/* Left Column: Registered Devices */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Smartphone size={13} className="text-[var(--panel-primary-text)]" />
                    <span className="text-[12.5px] font-semibold text-[var(--win-text)]">
                      {t("settings.listener.registeredDevices")}
                    </span>
                  </div>
                  <Badge tone="neutral" size="sm">
                    {t("settings.listener.deviceCount", { count: notificationDevices.length })}
                  </Badge>
                </div>

                <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)]/30 min-h-[170px] max-h-[280px] overflow-y-auto">
                  {notificationDevicesQuery.isLoading ? (
                    <LoadingState>{t("settings.listener.loadingDevices")}</LoadingState>
                  ) : notificationDevicesQuery.isError ? (
                    <ErrorState
                      title={t("settings.listener.devicesFailed")}
                      hint={t("settings.listener.retryHint")}
                      action={
                        <Button variant="primary" size="sm" onClick={() => void notificationDevicesQuery.refetch()}>
                          {t("common.retry")}
                        </Button>
                      }
                    />
                  ) : notificationDevices.length === 0 ? (
                    <div className="p-6 text-center flex flex-col items-center justify-center min-h-[170px]">
                      <Smartphone className="h-8 w-8 text-[var(--text-muted)] opacity-50 mb-2" strokeWidth={1.5} />
                      <p className="text-[11.5px] text-[var(--text-secondary)] max-w-xs leading-relaxed">
                        {t("settings.listener.noDevices")}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--win-border)]/50">
                      {notificationDevices.map((device) => (
                        <ListRow
                          key={device.id}
                          title={<span className="truncate font-medium text-[12px]" title={device.deviceId}>{device.deviceId}</span>}
                          tag={<Badge tone={STATUS_TONE[device.status] ?? "danger"} dot size="sm">{device.status}</Badge>}
                          details={(device.packageFilter ?? []).length ? (device.packageFilter ?? []).join(", ") : t("settings.listener.allPackages")}
                          actions={
                            <>
                              <IconButton label={t("common.edit")} onClick={() => handleUseDeviceForEdit(device.deviceId, device.packageFilter ?? [], device.status)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </IconButton>
                              <IconButton label={t("common.delete")} tone="danger" disabled={deleteDeviceMutation.isPending} onClick={() => void handleDeleteListenerDevice(device.deviceId)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </IconButton>
                            </>
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Latest Notifications */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BadgeCheck size={13} className="text-[var(--panel-primary-text)]" />
                    <span className="text-[12.5px] font-semibold text-[var(--win-text)]">
                      {t("settings.listener.latestNotifications")}
                    </span>
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

                <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)]/30 min-h-[170px] max-h-[280px] overflow-y-auto">
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
                    <div className="p-6 text-center flex flex-col items-center justify-center min-h-[170px]">
                      <BadgeCheck className="h-8 w-8 text-[var(--text-muted)] opacity-50 mb-2" strokeWidth={1.5} />
                      <p className="text-[11.5px] text-[var(--text-secondary)] max-w-xs leading-relaxed">
                        {t("settings.listener.noNotifications")}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--win-border)]/50">
                      {capturedNotifications.slice(0, 10).map((notif) => (
                        <ListRow
                          key={notif.id}
                          title={<span className="truncate font-medium text-[12px]">{notif.appName || notif.packageName}</span>}
                          tag={notif.amountDetected ? <Badge tone="success" size="sm">Rp {Number(notif.amountDetected).toLocaleString("id-ID")}</Badge> : undefined}
                          actions={<span className="panel-mono text-[10.5px] text-[var(--text-secondary)]">{formatDateTimeID(notif.receivedAt || notif.createdAt)}</span>}
                          details={<span className="line-clamp-2 text-[11.5px]"><strong className="font-medium text-[var(--win-text)]">{notif.title}</strong> {notif.body}</span>}
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
        ) : (
          /* ── SECTION 2: MENGHUBUNGKAN PENGIRIM ── */
          <div className="space-y-3.5">
            {/* Step 1: Endpoint Integrasi */}
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <Wifi className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
                <div>
                  <h3 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">
                    {t("settings.listener.endpointsTitle")}
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                    {t("settings.listener.endpointsSubtitle")}
                  </p>
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
                    <code className="panel-mono mt-1.5 block break-all text-[11px] text-[var(--win-text)] bg-[var(--panel-surface-hover)] p-2 rounded border border-[var(--win-border)]">
                      {listenerRegisterUrl}
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
                    <code className="panel-mono mt-1.5 block break-all text-[11px] text-[var(--win-text)] bg-[var(--panel-surface-hover)] p-2 rounded border border-[var(--win-border)]">
                      {listenerWebhookUrl}
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
                    <code className="panel-mono mt-1.5 block break-all text-[11px] text-[var(--win-text)] bg-[var(--panel-surface-hover)] p-2 rounded border border-[var(--win-border)]">
                      {listenerSocketUrl}
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
                    <h3 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">
                      {t("settings.listener.manageTitle")}
                    </h3>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                      {t("settings.listener.manageSubtitle")}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCcw size={12} />}
                  onClick={() =>
                    setListenerApiKey(`ypnl_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`)
                  }
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

              <p className="text-[11px] text-[var(--text-secondary)]">
                {t("settings.listener.apiKeyHelp")}
              </p>

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
                  <h3 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">
                    {t("settings.listener.schemaTitle")}
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                    {t("settings.listener.schemaSubtitle")}
                  </p>
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
                    {t("settings.listener.registerBodyHelpStart")}{" "}
                    <strong className="text-[var(--win-text)]">apiKey</strong>{" "}
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
                    {t("settings.listener.webhookBodyHelpStart")}{" "}
                    <strong className="text-[var(--win-text)]">X-API-Key</strong>{" "}
                    {t("settings.listener.webhookBodyHelpEnd")}{" "}
                    <code className="panel-mono text-[10.5px] text-[var(--win-text)] bg-[var(--panel-surface-hover)] px-1 rounded border border-[var(--win-border)]">?api_key=...</code>
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
              <Button
                type="button"
                onClick={() => setActiveTab("api_tokens")}
                variant="default"
                size="sm"
                className="!h-8 px-3.5 text-[12px] shrink-0"
              >
                {t("settings.listener.openTokens")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

