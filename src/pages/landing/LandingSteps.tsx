export type LandingStep = {
  id: string
  title: string
  desc: string
  // Small mono line above the title, e.g. the part of a name
  label?: string
  accent?: boolean
}

const COLUMNS = { 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' } as const

// Numbered steps on a line that leads to the next one: across on a wide screen, down on a narrow one
export function LandingSteps({ steps, label }: { steps: LandingStep[]; label: string }) {
  const columns = steps.length === 3 ? 3 : 4
  return (
    <ol aria-label={label} className={`mt-5 grid gap-5 sm:gap-4 ${COLUMNS[columns]}`}>
      {steps.map((step, index) => (
        <li
          key={step.id}
          className="relative pl-9 sm:pl-0 sm:pt-9
            before:absolute before:bg-[var(--win-border)] before:content-['']
            before:left-3 before:top-7 before:h-[calc(100%+0.75rem)] before:w-px last:before:hidden
            sm:before:left-8 sm:before:right-[-1rem] sm:before:top-3 sm:before:h-px sm:before:w-auto"
        >
          <span className="panel-mono absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--win-border)] bg-[var(--panel-surface)] text-[0.6875rem] font-semibold text-[var(--text-secondary)]">
            {index + 1}
          </span>
          {step.label ? <p className="panel-mono mb-0.5 text-[0.75rem] text-[var(--panel-info-text)]">{step.label}</p> : null}
          <h3 className={`text-[0.875rem] font-semibold leading-snug ${step.accent ? 'text-[var(--panel-info-text)]' : ''}`}>{step.title}</h3>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{step.desc}</p>
        </li>
      ))}
    </ol>
  )
}
