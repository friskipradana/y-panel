import { useMemo, useState } from "react";
import { isIpAddress } from "@/lib/hostValidation";
import { CheckCircle2, Globe2, Plus, Trash2 } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { useI18n } from "@/lib/i18n";
import { TIMEZONES, PRESET_DNS } from "./constants";
import { IconButton } from "@/components/ui/IconButton"
import { Button } from "@/components/ui/Button"
import { TextInput } from "@/components/ui/Field"

export function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <span className="text-[12px] font-semibold text-[var(--win-text)]">
        {label}
      </span>
      {hint ? (
        <span className="panel-mono text-[12px] text-[var(--text-secondary)]">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function TimezoneSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const timezoneOptions = useMemo(
    () => TIMEZONES.map((timezone) => ({ value: timezone, label: timezone })),
    [],
  );
  const { t } = useI18n();

  return (
    <Select
      id="settings-timezone-select"
      value={value}
      onChange={onChange}
      options={timezoneOptions}
      placeholder={t("settings.timezonePlaceholder")}
      searchable
      searchPlaceholder={t("settings.timezoneSearchPlaceholder")}
    />
  );
}

export function DnsEditor({
  nameservers,
  onChange,
}: {
  nameservers: string[];
  onChange: (v: string[]) => void;
}) {
  const [newEntry, setNewEntry] = useState("");
  const { t } = useI18n();

  const [entryError, setEntryError] = useState(false);

  const addEntry = () => {
    const value = newEntry.trim();
    if (!value) return;
    if (!isIpAddress(value)) {
      setEntryError(true);
      return;
    }
    setEntryError(false);
    if (nameservers.includes(value)) return;
    onChange([...nameservers, value]);
    setNewEntry("");
  };

  const removeEntry = (index: number) =>
    onChange(nameservers.filter((_, currentIndex) => currentIndex !== index));
  const addPreset = (ip: string) => {
    if (!nameservers.includes(ip)) onChange([...nameservers, ip]);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Active Nameservers List */}
      {nameservers.length === 0 ? (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-dashed border-[var(--win-border)] bg-[var(--panel-surface)] text-[12px] text-[var(--text-secondary)]">
          <Globe2 size={15} className="opacity-50 shrink-0" />
          <span className="flex-1">{t("settings.noNameservers")}</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--panel-surface-hover)] border border-[var(--win-border)] opacity-75 shrink-0">
            system-default
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-0.5">
          {nameservers.map((nameserver, index) => (
            <div
              key={`${nameserver}-${index}`}
              className="flex items-center justify-between px-3.5 py-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] hover:border-[var(--panel-primary-solid)]/40 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2
                  size={13}
                  className="text-[var(--panel-success-text)] shrink-0"
                />
                <code className="panel-mono text-[12.5px] font-medium text-[var(--win-text)] truncate">
                  {nameserver}
                </code>
              </div>
              <IconButton
                type="button"
                onClick={() => removeEntry(index)} label={t("settings.removeNameserverAria", { nameserver })} className="h-7 w-7 rounded-lg text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
              >
                <Trash2 size={13} />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      {entryError ? (
        <p role="alert" className="text-[12px] text-[var(--panel-danger-text)]">{t("settings.dnsInvalid")}</p>
      ) : null}

      {/* Add Custom DNS Input Group */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <TextInput
            value={newEntry}
            onChange={(event) => {
              setNewEntry(event.target.value);
              setEntryError(false);
            }}
            invalid={entryError}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addEntry();
              }
            }}
            placeholder={t("settings.addDnsPlaceholder")} className="panel-mono h-[38px] w-full px-3.5 text-[12.5px]"
          />
        </div>
        <Button
          type="button"
          onClick={addEntry}
          disabled={!newEntry.trim()} variant="primary" className="h-[38px] px-3.5 rounded-xl text-[12px] font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
          aria-label={t("settings.addNameserverAria")}
        >
          <Plus size={14} />
          <span>{t("common.add") || "Add"}</span>
        </Button>
      </div>

      {/* Quick DNS Presets */}
      <div>
        <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5 opacity-80">
          Quick Presets
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {PRESET_DNS.map((preset) => {
            const active = nameservers.includes(preset.value);
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => addPreset(preset.value)}
                disabled={active}
                className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium border transition-all ${
                  active
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 opacity-60 cursor-default"
                    : "border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--win-text)] hover:bg-[var(--panel-surface-hover)] hover:border-[var(--panel-primary-text)]/40 cursor-pointer"
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  {active ? (
                    <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
                  ) : (
                    <Plus size={11} className="opacity-60 shrink-0" />
                  )}
                  <span className="truncate">{preset.label}</span>
                </div>
                <span className="font-mono text-[9.5px] opacity-70 shrink-0">({preset.value})</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AuditCard({
  username,
  createdAt,
  hostname,
  timezone,
  nameservers,
}: {
  username?: string;
  createdAt: string;
  hostname?: string;
  timezone?: string;
  nameservers: string[];
}) {
  const { t } = useI18n();

  return (
    <div className="panel-shell-card px-4 py-3.5 shadow-[var(--settings-audit-card-shadow)]">
      <div className="mb-2.5 flex items-center gap-1.5 text-[12px] uppercase tracking-[0.10em] text-[var(--text-secondary)]">
        <span>{username || "system"}</span>
        <span>•</span>
        <span>{new Date(createdAt).toLocaleString()}</span>
      </div>
      <div className="flex flex-col gap-1 text-[12px] text-[var(--win-text)]">
        <div>
          <strong className="text-[var(--text-secondary)]">
            {t("settings.hostColon")}
          </strong>{" "}
          {hostname || "—"}
        </div>
        <div>
          <strong className="text-[var(--text-secondary)]">
            {t("settings.tzColon")}
          </strong>{" "}
          {timezone || "—"}
        </div>
        <div>
          <strong className="text-[var(--text-secondary)]">
            {t("settings.dnsColon")}
          </strong>{" "}
          {nameservers.length ? nameservers.join(", ") : "—"}
        </div>
      </div>
    </div>
  );
}

