import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquareText, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { listNotifyTemplates, resetNotifyTemplate, saveNotifyTemplate, type NotifyTemplate } from '@/api/notify'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Tabs } from '@/components/ui/Tabs'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { fillSamples, renderNoticeMarkup, unknownVariables } from './templateText'

type Locale = 'id' | 'en'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// The wording of every notice, for the seller: pick an event and a language, edit with the variables it offers, see it, save it
export function TemplatesCard() {
  const { t } = useI18n()
  const query = useQuery({ queryKey: ['notify', 'templates'], queryFn: listNotifyTemplates, retry: 0 })
  const [event, setEvent] = useState('')

  if (query.isLoading) return <LoadingState>{t('notify.loading')}</LoadingState>
  if (query.isError || !query.data) return <ErrorState title={t('notify.templates.loadFailed')} hint={t('notify.queue.loadFailedHint')} />
  const items = query.data.items
  const current = items.find((item) => item.event === event) ?? items[0]
  return (
    <div className="flex flex-col gap-3.5">
      <SectionHeader
        icon={<MessageSquareText />}
        title={t('notify.templates.title')}
        subtitle={t('notify.templates.subtitle')}
        tone="primary"
        className="mb-0"
      />
      <p className="panel-muted-block px-3 py-2 text-[11.5px] leading-relaxed text-[var(--text-secondary)]">{t('notify.templates.cloudNote')}</p>
      <Field label={t('notify.templates.event')}>
        <Select
          value={current.event}
          onChange={setEvent}
          searchable
          options={items.map((item) => ({
            value: item.event,
            label: t(`notify.event.${item.event}`),
            description: `${t(item.seller ? 'notify.templates.forSeller' : item.group === 'buyer' ? 'notify.templates.forBuyer' : 'notify.templates.forAccount')}${Object.keys(item.custom).length > 0 ? ` · ${t('notify.templates.changed')}` : ''}`,
          }))}
        />
      </Field>
      <Editor key={current.event} item={current} maxLength={query.data.maxLength} />
    </div>
  )
}

function Editor({ item, maxLength }: { item: NotifyTemplate; maxLength: number }) {
  const { t, language } = useI18n()
  const qc = useQueryClient()
  const [locale, setLocale] = useState<Locale>(language === 'en' ? 'en' : 'id')
  const [drafts, setDrafts] = useState<Partial<Record<Locale, string>>>({})
  const [error, setError] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)

  const saved = item.custom[locale]
  const original = item.default[locale]
  const value = drafts[locale] ?? saved ?? original
  const isCustom = saved !== undefined
  const dirty = value !== (saved ?? original)
  const unknown = useMemo(() => unknownVariables(value, item.vars), [value, item.vars])
  const tooLong = value.length > maxLength
  const invalid = value.trim() === '' || unknown.length > 0 || tooLong

  const setValue = (next: string) => {
    setDrafts((d) => ({ ...d, [locale]: next }))
    setError('')
  }
  const clearDraft = () => setDrafts((d) => ({ ...d, [locale]: undefined }))

  const save = useMutation({
    mutationFn: () => saveNotifyTemplate(item.event, locale, value),
    onSuccess: () => {
      clearDraft()
      void qc.invalidateQueries({ queryKey: ['notify', 'templates'] })
      toast.success(t('notify.templates.saved'))
    },
    onError: (e) => setError(apiError(e, t('notify.templates.saveFailed'))),
  })
  const reset = useMutation({
    mutationFn: () => resetNotifyTemplate(item.event, locale),
    onSuccess: () => {
      clearDraft()
      void qc.invalidateQueries({ queryKey: ['notify', 'templates'] })
      toast.success(t('notify.templates.resetDone'))
    },
    onError: (e) => toast.error(apiError(e, t('notify.templates.saveFailed'))),
  })
  const askReset = async () => {
    const ok = await alertLib.confirm(
      t('notify.templates.resetQuestion'),
      t('notify.templates.resetMessage', { event: t(`notify.event.${item.event}`) }),
      t('notify.templates.reset'),
      t('common.cancel'),
      'warning',
      'settings',
    )
    if (ok) reset.mutate()
  }

  // a variable goes where the cursor is, replacing what is selected
  const insert = (name: string) => {
    const el = area.current
    const token = `{${name}}`
    if (!el) return setValue(value + token)
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    setValue(value.slice(0, start) + token + value.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const fieldError = error || (unknown.length > 0 ? t('notify.templates.unknownVar', { name: `{${unknown[0]}}` }) : tooLong ? t('notify.templates.tooLong', { max: maxLength }) : undefined)

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          label={t('notify.templates.language')}
          value={locale}
          onChange={(next) => setLocale(next)}
          items={[
            { key: 'id', label: 'Indonesia' },
            { key: 'en', label: 'English' },
          ]}
        />
        <Badge tone={isCustom ? 'primary' : 'neutral'} dot>
          {isCustom ? t('notify.templates.changed') : t('notify.templates.original')}
        </Badge>
      </div>

      <Field label={t('notify.templates.text')} error={fieldError} hint={t('notify.templates.textHint', { count: value.length, max: maxLength })}>
        <Textarea ref={area} rows={9} value={value} invalid={!!fieldError} onChange={(e) => setValue(e.target.value)} className="panel-input--mono" />
      </Field>

      <div>
        <p className="panel-section-label">{t('notify.templates.variables')}</p>
        <div className="flex flex-wrap gap-1.5">
          {item.vars.map((name) => (
            <button
              key={name}
              type="button"
              className="panel-btn panel-mono !h-7 !px-2 !text-[0.75rem]"
              title={t('notify.templates.insertVar', { name: `{${name}}` })}
              onClick={() => insert(name)}
            >
              {`{${name}}`}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="panel-section-label">{t('notify.templates.preview')}</p>
        <div className="panel-muted-block whitespace-pre-wrap break-words px-3 py-2.5 text-[0.8125rem] leading-relaxed">
          {renderNoticeMarkup(fillSamples(value))}
          <span className="block pt-3 opacity-70">- Reneo</span>
        </div>
        <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{t('notify.templates.previewHint')}</p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--win-border)] pt-3.5">
        {isCustom ? (
          <Button variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} loading={reset.isPending} onClick={() => void askReset()}>
            {t('notify.templates.reset')}
          </Button>
        ) : null}
        {dirty ? (
          <Button variant="ghost" onClick={clearDraft}>
            {t('notify.templates.discard')}
          </Button>
        ) : null}
        <Button variant="primary" disabled={!dirty || invalid} loading={save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
