import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import type { StudioScheduleCadence, StudioScheduleMode } from '@/api/studio'
import { Button } from '@/components/ui/Button'
import { Field, Textarea, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import type { PageStudioWindowState } from './usePageStudioWindow'

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, '0')}:00`,
}))

export function StudioScheduleModal({ st }: { st: PageStudioWindowState }) {
  const { t, editingSchedule, setEditingSchedule, saveScheduleMut } = st
  const open = editingSchedule !== null
  const isEdit = editingSchedule !== null && editingSchedule !== 'new'

  const [name, setName] = useState('')
  const [mode, setMode] = useState<StudioScheduleMode>('enrich_docs')
  const [theme, setTheme] = useState('')
  const [category, setCategory] = useState('panduan')
  const [topicsText, setTopicsText] = useState('')
  const [language, setLanguage] = useState<'id' | 'en'>('id')
  const [cadence, setCadence] = useState<StudioScheduleCadence>('daily')
  const [runHour, setRunHour] = useState(9)
  const [runWeekday, setRunWeekday] = useState(1)
  const [autoPublish, setAutoPublish] = useState(true)
  const [showInDocs, setShowInDocs] = useState(true)
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (!open) return
    if (editingSchedule && editingSchedule !== 'new') {
      setName(editingSchedule.name)
      setMode(editingSchedule.mode)
      setTheme(editingSchedule.theme)
      setCategory(editingSchedule.category || 'panduan')
      setTopicsText((editingSchedule.topics ?? []).join('\n'))
      setLanguage(editingSchedule.language === 'en' ? 'en' : 'id')
      setCadence(editingSchedule.cadence)
      setRunHour(editingSchedule.runHour)
      setRunWeekday(editingSchedule.runWeekday)
      setAutoPublish(editingSchedule.autoPublish)
      setShowInDocs(editingSchedule.showInDocs)
      setEnabled(editingSchedule.enabled)
    } else {
      setName('')
      setMode('enrich_docs')
      setTheme('')
      setCategory('panduan')
      setTopicsText('')
      setLanguage('id')
      setCadence('daily')
      setRunHour(9)
      setRunWeekday(1)
      setAutoPublish(true)
      setShowInDocs(true)
      setEnabled(true)
    }
  }, [open, editingSchedule])

  const submit = () => {
    if (!name.trim()) return
    const topics = topicsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    saveScheduleMut.mutate({
      id: isEdit ? editingSchedule.id : undefined,
      payload: {
        name: name.trim(),
        mode,
        theme: theme.trim(),
        brandName: 'Reneo',
        category: category.trim() || 'panduan',
        topics,
        language,
        cadence,
        runHour,
        runWeekday,
        autoPublish,
        showInDocs,
        enabled,
      },
    })
  }

  return (
    <Modal
      open={open}
      onClose={() => setEditingSchedule(null)}
      title={isEdit ? t('studio.schedule.editTitle') : t('studio.schedule.newTitle')}
      subtitle={t('studio.schedule.modalSubtitle')}
      icon={<CalendarClock />}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => setEditingSchedule(null)}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={saveScheduleMut.isPending} disabled={!name.trim()} onClick={submit}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('studio.schedule.nameLabel')}>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('studio.schedule.namePh')} />
          </Field>
          <Field label={t('studio.schedule.modeLabel')}>
            <Select
              value={mode}
              onChange={(v) => setMode(v as StudioScheduleMode)}
              options={[
                { value: 'enrich_docs', label: t('studio.schedule.modeEnrich') },
                { value: 'topic_series', label: t('studio.schedule.modeTopic') },
              ]}
            />
          </Field>
        </div>

        <Field label={t('studio.schedule.themeLabel')} hint={t('studio.schedule.themeHint')}>
          <Textarea rows={2} value={theme} onChange={(e) => setTheme(e.target.value)} placeholder={t('studio.schedule.themePh')} />
        </Field>

        <Field label={t('studio.schedule.topicsLabel')} hint={t('studio.schedule.topicsHint')}>
          <Textarea rows={3} value={topicsText} onChange={(e) => setTopicsText(e.target.value)} placeholder={t('studio.schedule.topicsPh')} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('studio.schedule.categoryLabel')}>
            <TextInput value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('studio.schedule.categoryPh')} />
          </Field>
          <Field label={t('studio.schedule.languageLabel')}>
            <Select
              value={language}
              onChange={(v) => setLanguage(v as 'id' | 'en')}
              options={[
                { value: 'id', label: t('studio.schedule.langId') },
                { value: 'en', label: t('studio.schedule.langEn') },
              ]}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t('studio.schedule.cadenceLabel')}>
            <Select
              value={cadence}
              onChange={(v) => setCadence(v as StudioScheduleCadence)}
              options={[
                { value: 'hourly', label: t('studio.schedule.cadence.hourly') },
                { value: 'daily', label: t('studio.schedule.cadence.daily') },
                { value: 'weekly', label: t('studio.schedule.cadence.weekly') },
                { value: 'monthly', label: t('studio.schedule.cadence.monthly') },
              ]}
            />
          </Field>
          {cadence !== 'hourly' ? (
            <Field label={t('studio.schedule.hourLabel')}>
              <Select value={String(runHour)} onChange={(v) => setRunHour(Number(v))} options={HOURS} />
            </Field>
          ) : null}
          {cadence === 'weekly' ? (
            <Field label={t('studio.schedule.weekdayLabel')}>
              <Select
                value={String(runWeekday)}
                onChange={(v) => setRunWeekday(Number(v))}
                options={[
                  { value: '1', label: t('studio.schedule.weekday.mon') },
                  { value: '2', label: t('studio.schedule.weekday.tue') },
                  { value: '3', label: t('studio.schedule.weekday.wed') },
                  { value: '4', label: t('studio.schedule.weekday.thu') },
                  { value: '5', label: t('studio.schedule.weekday.fri') },
                  { value: '6', label: t('studio.schedule.weekday.sat') },
                  { value: '0', label: t('studio.schedule.weekday.sun') },
                ]}
              />
            </Field>
          ) : null}
        </div>

        <SettingRow
          title={t('studio.schedule.autoPublishTitle')}
          description={t('studio.schedule.autoPublishDesc')}
          control={<ToggleSwitch checked={autoPublish} onChange={() => setAutoPublish((v) => !v)} label={t('studio.schedule.autoPublishTitle')} />}
        />
        <SettingRow
          title={t('studio.showInDocsTitle')}
          description={t('studio.showInDocsDesc')}
          control={<ToggleSwitch checked={showInDocs} onChange={() => setShowInDocs((v) => !v)} label={t('studio.showInDocsTitle')} />}
        />
        <SettingRow
          title={t('studio.schedule.enabledTitle')}
          description={t('studio.schedule.enabledDesc')}
          control={<ToggleSwitch checked={enabled} onChange={() => setEnabled((v) => !v)} label={t('studio.schedule.enabledTitle')} />}
        />
      </div>
    </Modal>
  )
}
