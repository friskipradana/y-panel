import type { ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import { SelectableCard } from "@/components/ui/SelectableCard";

export interface OptionCardItem<T extends string> {
  key: T;
  label: string;
  description?: string;
  icon?: ReactNode;
}

interface OptionCardsProps<T extends string> {
  /** Names the group for screen readers */
  label: string;
  value: T;
  onChange: (key: T) => void;
  options: OptionCardItem<T>[];
}

const COLUMNS: Record<number, string> = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5" };

// Pick one of a few: the card that is chosen shows a check, and each card says what it does
export function OptionCards<T extends string>({ label, value, onChange, options }: OptionCardsProps<T>) {
  return (
    <div role="group" aria-label={label} className={`grid grid-cols-1 gap-2.5 ${COLUMNS[options.length] ?? "sm:grid-cols-3"}`}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <SelectableCard key={option.key} selected={selected} onClick={() => onChange(option.key)} className="flex items-center gap-2.5 rounded-lg p-2.5 text-left">
            {option.icon ? <span className="shrink-0 text-[var(--panel-primary-text)] [&_svg]:h-4 [&_svg]:w-4">{option.icon}</span> : null}
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold text-[var(--win-text)]">{option.label}</span>
              {option.description ? <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-secondary)]">{option.description}</span> : null}
            </span>
            {selected ? <CircleCheck size={15} className="shrink-0 text-[var(--panel-primary-text)]" aria-hidden="true" /> : null}
          </SelectableCard>
        );
      })}
    </div>
  );
}
