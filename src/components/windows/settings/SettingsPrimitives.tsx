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
        <span className="panel-mono text-[10px] text-[var(--text-secondary)] px-1.5 py-0.5 rounded bg-[var(--panel-surface-hover)] border border-[var(--win-border)]">
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
      buttonClassName="!h-8 text-[12px] px-2.5"
      dropdownWidth={360}
      align="right"
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
    <div className="flex flex-col gap-2.5">
      {/* Active Nameservers List */}
      {nameservers.length === 0 ? (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-dashed border-[var(--win-border)] bg-[var(--panel-surface)] text-[11.5px] text-[var(--text-secondary)]">
          <Globe2 size={13} className="opacity-50 shrink-0" />
          <span className="flex-1">{t("settings.noNameservers")}</span>
          <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-[var(--panel-surface-hover)] border border-[var(--win-border)] opacity-75 shrink-0">
            {t("settings.systemDefault")}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto pr-0.5">
          {nameservers.map((nameserver, index) => (
            <div
              key={`${nameserver}-${index}`}
              className="flex items-center justify-between px-2.5 py-1 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface-hover)] hover:border-[var(--panel-primary-text)]/40 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2
                  size={12}
                  className="text-[var(--panel-success-text)] shrink-0"
                />
                <code className="panel-mono text-[12px] font-medium text-[var(--win-text)] truncate">
                  {nameserver}
                </code>
              </div>
              <IconButton
                type="button"
                tone="danger"
                onClick={() => removeEntry(index)}
                label={t("settings.removeNameserverAria", { nameserver })}
                className="!h-6 !w-6"
              >
                <Trash2 size={12} />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      {entryError ? (
        <p role="alert" className="text-[11.5px] text-[var(--panel-danger-text)]">{t("settings.dnsInvalid")}</p>
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
            placeholder={t("settings.addDnsPlaceholder")}
            className="panel-mono !h-8 w-full px-2.5 text-[12px] placeholder:text-[11px]"
          />
        </div>
        <Button
          type="button"
          onClick={addEntry}
          disabled={!newEntry.trim()}
          variant="primary"
          className="shrink-0 !h-8 px-3 text-[11.5px]"
          aria-label={t("settings.addNameserverAria")}
        >
          <Plus size={13} />
          <span>{t("common.add")}</span>
        </Button>
      </div>

      {/* Quick DNS Presets */}
      <div>
        <div className="text-[10.5px] font-semibold text-[var(--text-secondary)] mb-1">
          {t("settings.dnsPresets")}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {PRESET_DNS.map((preset) => {
            const active = nameservers.includes(preset.value);
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => addPreset(preset.value)}
                disabled={active}
                className={`flex items-center justify-between gap-1 px-2 py-1 rounded-md text-[10.5px] font-medium border transition-colors ${
                  active
                    ? "border-[var(--panel-success-border)] bg-[var(--panel-success-bg)] text-[var(--panel-success-text)] opacity-70 cursor-default"
                    : "border-[var(--win-border)] bg-[var(--panel-surface-hover)] text-[var(--win-text)] hover:border-[var(--panel-primary-text)]/50 cursor-pointer"
                }`}
              >
                <span className="truncate">{preset.label}</span>
                <span className="font-mono text-[9.5px] text-[var(--text-secondary)] shrink-0">{preset.value}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

