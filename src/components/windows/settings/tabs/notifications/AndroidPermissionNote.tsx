import { useI18n } from "@/lib/i18n";

export function AndroidPermissionNote() {
  const { t } = useI18n();

  return (
    <div className="p-3 settings-inset text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
      <strong className="text-[var(--win-text)] font-semibold">
        {t("settings.listener.howItWorksTitle")}
      </strong>{" "}
      {t("settings.listener.howItWorksStart")}{" "}
      <code className="panel-mono text-[11px] text-[var(--win-text)] bg-[var(--panel-surface-hover)] px-1.5 py-0.5 rounded border border-[var(--win-border)]">
        NotificationListener
      </code>{" "}
      {t("settings.listener.howItWorksEnd")}
    </div>
  );
}
