import { Clock, Globe, HardDrive, Shield, User } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatDateTimeID } from "@/lib/datetime";
import type { HostSettings } from "../hooks/useHostSettings";
import { Badge } from "@/components/ui/Badge";
import { IconBadge } from "@/components/ui/IconBadge";
import { SettingsGroup } from "../SettingsPrimitives";

export function AuditTab({ host }: { host: HostSettings }) {
  const { t } = useI18n();
  const { settingsAudit } = host;

  return (
    <div className="space-y-6">
      {/* ── GNOME Boxed Group: Audit Trail ── */}
      <SettingsGroup
        title={t("settings.auditTrail")}
        description={t("settings.auditTrailSubtitle")}
        action={
          <Badge tone="neutral" size="sm">
            {t("settings.entriesCount", { count: settingsAudit.length })}
          </Badge>
        }
        cardClassName="!p-0"
      >
        {settingsAudit.length ? (
          <div className="divide-y divide-[var(--win-border)]">
            {settingsAudit.map((entry) => (
              <div
                key={entry.id}
                className="p-3.5 hover:bg-[var(--panel-surface-hover)] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                {/* Left: User & Timestamp */}
                <div className="flex items-start gap-2.5 min-w-0">
                  <IconBadge
                    size="md"
                    tone={entry.username ? "primary" : "neutral"}
                    className="mt-0.5"
                  >
                    {entry.username ? <User /> : <Shield />}
                  </IconBadge>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12.5px] font-semibold text-[var(--win-text)]">
                        {entry.username || "system"}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 flex items-center gap-1.5 font-mono">
                      <Clock size={11} className="shrink-0 text-[var(--text-muted)]" />
                      <span>{formatDateTimeID(entry.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Host, Timezone, DNS Details */}
                <div className="flex flex-wrap items-center gap-2 text-[11px] md:justify-end">
                  {/* Hostname */}
                  <div className="flex items-center gap-1.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)]/70 px-2 py-1">
                    <HardDrive size={11} className="text-[var(--text-muted)] shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      {t("settings.hostColon")}
                    </span>
                    <span className="panel-mono font-medium text-[var(--win-text)]">
                      {entry.hostname}
                    </span>
                  </div>

                  {/* Timezone */}
                  <div className="flex items-center gap-1.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)]/70 px-2 py-1">
                    <Clock size={11} className="text-[var(--text-muted)] shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      {t("settings.tzColon")}
                    </span>
                    <span className="panel-mono font-medium text-[var(--win-text)]">
                      {entry.timezone}
                    </span>
                  </div>

                  {/* Nameservers */}
                  <div className="flex items-center gap-1.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)]/70 px-2 py-1">
                    <Globe size={11} className="text-[var(--text-muted)] shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      {t("settings.dnsColon")}
                    </span>
                    <span className="panel-mono font-medium text-[var(--win-text)] max-w-[140px] truncate" title={entry.nameservers.join(", ")}>
                      {entry.nameservers.length ? entry.nameservers.join(", ") : "—"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <Clock className="h-6 w-6 text-[var(--text-muted)] mx-auto mb-2 opacity-50" />
            <p className="text-[12.5px] font-medium text-[var(--win-text)]">
              {t("settings.noAuditEntries")}
            </p>
          </div>
        )}
      </SettingsGroup>
    </div>
  );
}
