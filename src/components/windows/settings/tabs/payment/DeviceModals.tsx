import { useState } from "react";
import { Copy, KeyRound, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { copyTextToClipboard } from "@/api/agent";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import type { NotificationDevice } from "@/types";

const parseFilter = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

// The name of a phone and the apps it forwards; for a phone already added, also its status
export function DeviceFormModal({
  device,
  suggestedName,
  busy,
  onClose,
  onSubmit,
}: {
  device: NotificationDevice | null;
  suggestedName: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: { deviceId: string; status: string; packageFilter: string[] }) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(device?.deviceId ?? suggestedName);
  const [status, setStatus] = useState(device?.status ?? "active");
  const [filter, setFilter] = useState((device?.packageFilter ?? []).join(", "));

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      icon={<Smartphone />}
      title={device ? t("settings.listener.editDevice") : t("settings.listener.addDevice")}
      subtitle={device ? device.deviceId : t("settings.listener.addDeviceHint")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={name.trim() === ""}
            onClick={() => onSubmit({ deviceId: name.trim(), status, packageFilter: parseFilter(filter) })}
          >
            {device ? t("common.save") : t("settings.listener.createDevice")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {device ? (
          <Field label={t("settings.listener.status")}>
            <Select
              value={status}
              onChange={setStatus}
              options={[
                { value: "active", label: t("settings.listener.statusActive") },
                { value: "inactive", label: t("settings.listener.statusInactive") },
                { value: "blocked", label: t("settings.listener.statusBlocked") },
              ]}
            />
          </Field>
        ) : (
          <Field label={t("settings.listener.deviceId")} htmlFor="listener-device-name">
            <TextInput id="listener-device-name" mono maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
        )}
        <Field label={t("settings.listener.packageFilter")} htmlFor="listener-device-filter" hint={t("settings.listener.packageHint")}>
          <TextInput
            id="listener-device-filter"
            mono
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("settings.listener.packageFilterPlaceholder")}
          />
        </Field>
      </div>
    </Modal>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-[var(--text-secondary)]">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] py-1 pl-3 pr-1">
        <code className="panel-mono min-w-0 flex-1 select-all break-all text-[12px] text-[var(--win-text)]">{value}</code>
        <IconButton label={t("common.copy")} onClick={() => void copyTextToClipboard(value).then(() => toast.success(t("common.copied")))}>
          <Copy className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  );
}

// The API key of a phone, shown the one time the panel has it, with the two values the listener app asks for
export function DeviceKeyModal({ deviceId, apiKey, endpoint, onClose }: { deviceId: string; apiKey: string; endpoint: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal
      open
      onClose={onClose}
      closeOnOverlay={false}
      size="md"
      icon={<KeyRound />}
      title={t("settings.listener.keyReadyTitle")}
      subtitle={deviceId}
      footer={
        <Button variant="primary" onClick={onClose}>
          {t("settings.listener.keyDone")}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="rounded-lg border border-[var(--panel-warning-border)] bg-[var(--panel-warning-bg)] px-3 py-2 text-[12px] leading-relaxed text-[var(--panel-warning-text)]">
          {t("settings.listener.keyOnce")}
        </p>
        <CopyRow label={t("settings.listener.appEndpoint")} value={endpoint} />
        <CopyRow label={t("settings.listener.appApiKey")} value={apiKey} />
        <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]">{t("settings.listener.appSteps")}</p>
      </div>
    </Modal>
  );
}
