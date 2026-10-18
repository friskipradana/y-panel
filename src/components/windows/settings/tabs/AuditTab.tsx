import { Clock, Globe, HardDrive, Shield, User } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatDateTimeID } from "@/lib/datetime";
import type { HostSettings } from "../hooks/useHostSettings";
import { Badge } from "@/components/ui/Badge";
import { IconBadge } from "@/components/ui/IconBadge";

export function AuditTab({ host }: { host: HostSettings }) {
  const { t } = useI18n();
  const { settingsAudit } = host;

  return (
    <div className="space-y-3">
      {/* ── Single Unified Audit Trail Card ── */}
      <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
        {/* ── Section Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <Clock className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">
                  {t("settings.auditTrail")}
                </h2>
                <Badge tone="neutral" size="sm">
                  {t("settings.entriesCount", { count: settingsAudit.length })}
                </Badge>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                {t("settings.auditTrailSubtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── Audit Entries List ── */}
        {settingsAudit.length ? (
          <div className="divide-y divide-[var(--win-border)]/50 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)]/30 overflow-hidden">
            {settingsAudit.map((entry) => (
              <div
                key={entry.id}
                className="p-3 hover:bg-[var(--tb-hover)] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
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
                      {entry.hostname || "—"}
                    </span>
                  </div>

                  {/* Timezone */}
                  <div className="flex items-center gap-1.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)]/70 px-2 py-1">
                    <Globe size={11} className="text-[var(--text-muted)] shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      {t("settings.tzColon")}
                    </span>
                    <span className="text-[var(--win-text)]">
                      {entry.timezone || "—"}
                    </span>
                  </div>

                  {/* DNS */}
                  <div className="flex items-center gap-1.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)]/70 px-2 py-1 max-w-full">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] shrink-0">
                      {t("settings.dnsColon")}
                    </span>
                    <span className="panel-mono text-[var(--win-text)] truncate">
                      {entry.nameservers?.length ? entry.nameservers.join(", ") : "—"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="panel-empty min-h-[140px] text-[12px] flex flex-col items-center justify-center p-6 text-center">
            <Clock className="h-8 w-8 text-[var(--text-muted)] opacity-50 mb-2" strokeWidth={1.5} />
            <span className="text-[var(--text-secondary)]">{t("settings.noAuditEntries")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
