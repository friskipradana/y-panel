import { Copy } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useI18n } from "@/lib/i18n";

export function SchemaReferenceCard() {
  const { t } = useI18n();

  return (
    <div className="panel-shell-card p-4.5 flex flex-col gap-3">
      <SectionHeader
        icon={<Copy />}
        title={t("settings.listener.schemaTitle")}
        subtitle={t("settings.listener.schemaSubtitle")}
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
          <div className="mb-1.5 text-[11.5px] font-bold text-[var(--win-text)]">
            {t("settings.listener.registerBodyTitle")}
          </div>
          <pre className="panel-mono overflow-x-auto rounded-lg bg-[var(--panel-code-bg)] p-2.5 text-[11.5px] leading-relaxed text-[var(--panel-code-text)] border border-[var(--win-border)]">{`{
"deviceId": "wimboro-device-001",
"apiKey": "custom-api-key",
"packageFilter": ["com.whatsapp", "id.dana", "com.gojek.gopay"]
}`}</pre>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {t("settings.listener.registerBodyHelpStart")}{" "}
            <b>apiKey</b>{" "}
            {t("settings.listener.registerBodyHelpEnd")}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
          <div className="mb-1.5 text-[11.5px] font-bold text-[var(--win-text)]">
            {t("settings.listener.webhookBodyTitle")}
          </div>
          <pre className="panel-mono overflow-x-auto rounded-lg bg-[var(--panel-code-bg)] p-2.5 text-[11.5px] leading-relaxed text-[var(--panel-code-text)] border border-[var(--win-border)]">{`Header:
X-API-Key: <apiKey device>

Body:
{
"packageName": "id.dana",
"appName": "DANA",
"title": "${t("settings.listener.exampleTitle")}",
"text": "${t("settings.listener.exampleText")}",
"amountDetected": "25000"
}`}</pre>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {t("settings.listener.webhookBodyHelpStart")}{" "}
            <b>X-API-Key</b>{" "}
            {t("settings.listener.webhookBodyHelpEnd")}{" "}
            <code>?api_key=...</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
