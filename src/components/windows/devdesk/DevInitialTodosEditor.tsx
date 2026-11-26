import { Plus, Trash2 } from 'lucide-react'
import type { DevTodoPriority } from '@/api/devdesk'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'

export interface InitialTodoDraft {
  title: string
  notes: string
  priority: DevTodoPriority
}

interface DevInitialTodosEditorProps {
  todos: InitialTodoDraft[]
  onChange: (next: InitialTodoDraft[]) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

export function DevInitialTodosEditor({ todos, onChange, t }: DevInitialTodosEditorProps) {
  const update = (idx: number, patch: Partial<InitialTodoDraft>) => {
    onChange(todos.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  return (
    <div className="space-y-2 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.75rem] font-semibold text-[var(--win-text)]">
          {t('devdesk.initialTodosHeading', { count: todos.length })}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.75} />}
          onClick={() => onChange([...todos, { title: '', notes: '', priority: 'medium' }])}
        >
          {t('devdesk.addTodoBtn')}
        </Button>
      </div>
      <div className="space-y-1.5">
        {todos.map((td, idx) => (
          <div
            key={idx}
            className="grid grid-cols-1 gap-1.5 rounded-md border border-[var(--win-border)] bg-[var(--win-bar)] p-2 sm:grid-cols-[minmax(0,1fr)_110px_auto]"
          >
            <div className="space-y-1">
              <TextInput
                value={td.title}
                onChange={(e) => update(idx, { title: e.target.value })}
                placeholder={t('devdesk.addTodoPlaceholder')}
              />
              <TextInput
                value={td.notes}
                onChange={(e) => update(idx, { notes: e.target.value })}
                placeholder={t('devdesk.todoNotesPh')}
              />
            </div>
            <Select
              size="sm"
              value={td.priority}
              onChange={(v) => update(idx, { priority: v as DevTodoPriority })}
              options={[
                { value: 'high', label: t('devdesk.priority.high') },
                { value: 'medium', label: t('devdesk.priority.medium') },
                { value: 'low', label: t('devdesk.priority.low') },
              ]}
            />
            <IconButton
              size="sm"
              variant="ghost"
              tone="danger"
              label={t('common.delete')}
              onClick={() => onChange(todos.filter((_, i) => i !== idx))}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </IconButton>
          </div>
        ))}
      </div>
    </div>
  )
}
