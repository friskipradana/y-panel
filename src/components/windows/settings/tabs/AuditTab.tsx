import { Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { HostSettings } from "../hooks/useHostSettings";
import { AuditCard } from "../SettingsPrimitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Badge } from "@/components/ui/Badge"

export function AuditTab({ host }: { host: HostSettings }) {
  const { t } = useI18n();
  const {
    settingsAudit,
  } = host;

  return (
    <div className="panel-shell-card p-5">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <SectionHeader
          icon={<Clock />}
          title={t("settings.auditTrail")}
          subtitle={t("settings.auditTrailSubtitle")}
        />
        <Badge tone="info">
          {t("settings.entriesCount", {
            count: settingsAudit.length,
          })}
        </Badge>
      </div>

      {settingsAudit.length ? (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {settingsAudit.map((entry) => (
            <AuditCard
              key={entry.id}
              username={entry.username}
              createdAt={entry.createdAt}
              hostname={entry.hostname}
              timezone={entry.timezone}
              nameservers={entry.nameservers ?? []}
            />
          ))}
        </div>
      ) : (
        <div className="panel-empty min-h-[120px] text-[12px]">
          <span>{t("settings.noAuditEntries")}</span>
        </div>
      )}
    </div>
  );
}
