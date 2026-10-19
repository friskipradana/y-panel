import { useState } from "react";
import { KeyRound, LoaderCircle, Pencil, Plus, Smartphone, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { alertLib } from "@/lib/alert";
import { formatDateTimeID } from "@/lib/datetime";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ListRow } from "@/components/ui/ListRow";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import type { UiTone } from "@/components/ui/IconBadge";
import type { NotificationDevice } from "@/types";
import type { NotificationSettings } from "../../hooks/useNotificationSettings";
import type { SettingsTabKey } from "../../constants";
import { DeviceFormModal, DeviceKeyModal } from "./DeviceModals";

const STATUS_TONE: Record<string, UiTone> = { active: "success", inactive: "neutral", blocked: "danger" };

type Form = { device: NotificationDevice | null } | null;

// The phones that send bank notifications: any number of them, each with an API key of its own that the panel makes
export function ListenerDeviceList({ listener, setActiveTab }: { listener: NotificationSettings; setActiveTab: (tab: SettingsTabKey) => void }) {
  const { t } = useI18n();
  const {
    notificationDevicesQuery,
    notificationDevices,
    registerDeviceMutation,
    rotateKeyMutation,
    updateDeviceMutation,
    deleteDeviceMutation,
    handleDeleteListenerDevice,
    listenerWebhookUrl,
  } = listener;
  const [form, setForm] = useState<Form>(null);
  const [reveal, setReveal] = useState<{ deviceId: string; apiKey: string } | null>(null);

  const closeForm = () => setForm(null);

  const submit = (values: { deviceId: string; status: string; packageFilter: string[] }) => {
    if (form?.device) {
      updateDeviceMutation.mutate(
        { deviceId: form.device.deviceId, payload: { status: values.status, packageFilter: values.packageFilter } },
        { onSuccess: closeForm },
      );
      return;
    }
    registerDeviceMutation.mutate(
      { deviceId: values.deviceId, packageFilter: values.packageFilter },
      {
        onSuccess: (data) => {
          closeForm();
          if (data.apiKey) setReveal({ deviceId: data.device.deviceId, apiKey: data.apiKey });
        },
      },
    );
  };

  const renewKey = async (device: NotificationDevice) => {
    const confirmed = await alertLib.confirm(
      t("settings.listener.renewConfirmTitle"),
      t("settings.listener.renewConfirmMessage", { deviceId: device.deviceId }),
      t("settings.listener.renewConfirmAction"),
      t("common.cancel"),
      "warning",
      "settings",
    );
    if (!confirmed) return;
    rotateKeyMutation.mutate(device.deviceId, {
      onSuccess: (data) => {
        if (data.apiKey) setReveal({ deviceId: device.deviceId, apiKey: data.apiKey });
      },
    });
  };

  const seen = (device: NotificationDevice) =>
    device.lastSeenAt ? t("settings.listener.lastSeen", { time: formatDateTimeID(device.lastSeenAt) }) : t("settings.listener.neverSent");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
          <div>
            <h3 className="text-[13px] font-semibold leading-tight text-[var(--win-text)]">{t("settings.listener.manageTitle")}</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">{t("settings.listener.manageSubtitle")}</p>
          </div>
        </div>
        <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setForm({ device: null })}>
          {t("settings.listener.addDevice")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)]/30">
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
          <EmptyState icon={<Smartphone />}>{t("settings.listener.noDevices")}</EmptyState>
        ) : (
          <div className="divide-y divide-[var(--win-border)]/50">
            {notificationDevices.map((device) => {
              const renewing = rotateKeyMutation.isPending && rotateKeyMutation.variables === device.deviceId;
              return (
                <ListRow
                  key={device.id}
                  title={
                    <span className="panel-mono truncate text-[12px] font-medium" title={device.deviceId}>
                      {device.deviceId}
                    </span>
                  }
                  tag={
                    <Badge tone={STATUS_TONE[device.status] ?? "danger"} dot size="sm">
                      {t(`settings.listener.status${device.status.charAt(0).toUpperCase()}${device.status.slice(1)}`)}
                    </Badge>
                  }
                  details={
                    <>
                      {seen(device)} · {t("settings.listener.receivedCount", { count: device.received })}
                      <br />
                      {device.packageFilter.length ? device.packageFilter.join(", ") : t("settings.listener.allPackages")}
                    </>
                  }
                  actions={
                    <>
                      <IconButton label={t("settings.listener.renewKey")} disabled={rotateKeyMutation.isPending} onClick={() => void renewKey(device)}>
                        {renewing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                      </IconButton>
                      <IconButton label={t("common.edit")} onClick={() => setForm({ device })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label={t("common.delete")} tone="danger" disabled={deleteDeviceMutation.isPending} onClick={() => void handleDeleteListenerDevice(device.deviceId)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </>
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 text-[12px] text-[var(--win-text)]">
          <KeyRound size={14} className="shrink-0 text-[var(--panel-primary-text)]" />
          <span>{t("settings.listener.tokenNotice")}</span>
        </div>
        <Button type="button" onClick={() => setActiveTab("api_tokens")} variant="default" size="sm" className="shrink-0">
          {t("settings.listener.openTokens")}
        </Button>
      </div>

      {form ? (
        <DeviceFormModal
          device={form.device}
          suggestedName={t("settings.listener.suggestedName", { number: notificationDevices.length + 1 })}
          busy={registerDeviceMutation.isPending || updateDeviceMutation.isPending}
          onClose={closeForm}
          onSubmit={submit}
        />
      ) : null}
      {reveal ? <DeviceKeyModal deviceId={reveal.deviceId} apiKey={reveal.apiKey} endpoint={listenerWebhookUrl} onClose={() => setReveal(null)} /> : null}
    </div>
  );
}
