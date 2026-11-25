import { useEffect, useState } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { DevDocItem, DevDocKind, DevDocStatus, DevTodoPriority } from '@/api/devdesk'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import type { DevDeskWindowState } from './useDevDeskWindow'

const EMPTY_ITEM: DevDocItem = { title: '', description: '', qty: 1, unit: 'Paket', unitPrice: 0, subtotal: 0 }

export function DevDocEditorModal({ dd }: { dd: DevDeskWindowState }) {
  const { t, editingDoc, setEditingDoc, draftSeed, setDraftSeed, saveDocMut } = dd
  const open = Boolean(editingDoc || draftSeed)

  const [kind, setKind] = useState<DevDocKind>('invoice')
  const [docNumber, setDocNumber] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientCompany, setClientCompany] = useState('')
  const [clientContact, setClientContact] = useState('')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [items, setItems] = useState<DevDocItem[]>([{ ...EMPTY_ITEM }])
  const [discount, setDiscount] = useState('0')
  const [dpPercent, setDpPercent] = useState('50')
  const [paidAmount, setPaidAmount] = useState('0')
  const [status, setStatus] = useState<DevDocStatus>('draft')
  const [issueDate, setIssueDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [termsText, setTermsText] = useState('')
  const [paymentInfo, setPaymentInfo] = useState('')
  const [waMessage, setWaMessage] = useState('')
  const [sourceNotes, setSourceNotes] = useState('')
  const [shareChecklist, setShareChecklist] = useState(true)
  const [initialTodos, setInitialTodos] = useState<{ title: string; notes: string; priority: DevTodoPriority }[]>([])

  useEffect(() => {
    if (editingDoc) {
      setKind(editingDoc.kind)
      setDocNumber(editingDoc.docNumber)
      setClientName(editingDoc.clientName)
      setClientCompany(editingDoc.clientCompany)
      setClientContact(editingDoc.clientContact)
      setTitle(editingDoc.title)
      setSummary(editingDoc.summary)
      setItems(editingDoc.items.length > 0 ? editingDoc.items : [{ ...EMPTY_ITEM }])
      setDiscount(String(editingDoc.discount || 0))
      setDpPercent(String(editingDoc.dpPercent ?? 50))
      setPaidAmount(String(editingDoc.paidAmount || 0))
      setStatus(editingDoc.status)
      setIssueDate(editingDoc.issueDate || '')
      setDueDate(editingDoc.dueDate || '')
      setValidUntil(editingDoc.validUntil || '')
      setTermsText((editingDoc.terms ?? []).join('\n'))
      setPaymentInfo(editingDoc.paymentInfo || '')
      setWaMessage(editingDoc.waMessage || '')
      setSourceNotes(editingDoc.sourceNotes || '')
      setShareChecklist(editingDoc.shareChecklist)
      setInitialTodos([])
      return
    }
    if (draftSeed) {
      const gen = draftSeed.generated
      setKind(draftSeed.kind)
      setDocNumber('')
      setClientName(draftSeed.clientName ?? '')
      setClientCompany(draftSeed.clientCompany ?? '')
      setClientContact('')
      setTitle(gen?.title ?? '')
      setSummary(gen?.summary ?? '')
      setItems(gen?.items && gen.items.length > 0 ? gen.items : [{ ...EMPTY_ITEM }])
      setDiscount('0')
      setDpPercent(String(gen?.dpPercent ?? 50))
      setPaidAmount('0')
      setStatus('draft')
      setIssueDate(new Date().toISOString().slice(0, 10))
      setDueDate('')
      setValidUntil('')
      setTermsText((gen?.terms ?? []).join('\n'))
      setPaymentInfo('')
      setWaMessage(gen?.waMessage ?? '')
      setSourceNotes(draftSeed.sourceNotes ?? '')
      setShareChecklist(true)
      setInitialTodos(gen?.todos ?? [])
    }
  }, [editingDoc, draftSeed])

  const close = () => {
    setEditingDoc(null)
    setDraftSeed(null)
  }

  const updateItem = (idx: number, patch: Partial<DevDocItem>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it
        const next = { ...it, ...patch }
        next.subtotal = Math.max(1, Number(next.qty) || 1) * Math.max(0, Number(next.unitPrice) || 0)
        return next
      }),
    )
  }

  const subtotal = items.reduce((s, it) => s + (Math.max(1, it.qty) * Math.max(0, it.unitPrice)), 0)
  const total = Math.max(0, subtotal - Math.max(0, Number(discount) || 0))
  const dpNum = Math.round((total * Math.min(100, Math.max(0, Number(dpPercent) || 0))) / 100)

  const handleSave = () => {
    const cleanItems = items
      .filter((it) => it.title.trim() !== '')
      .map((it) => ({
        title: it.title.trim(),
        description: it.description.trim(),
        qty: Math.max(1, Number(it.qty) || 1),
        unit: it.unit.trim() || 'Paket',
        unitPrice: Math.max(0, Math.round(Number(it.unitPrice) || 0)),
        subtotal: Math.max(1, Number(it.qty) || 1) * Math.max(0, Math.round(Number(it.unitPrice) || 0)),
      }))
    const terms = termsText
      .split('\n')
      .map((l) => l.trim().replace(/^-\s*/, ''))
      .filter(Boolean)

    saveDocMut.mutate({
      id: editingDoc?.id,
      payload: {
        kind,
        docNumber: docNumber.trim() || undefined,
        clientName: clientName.trim(),
        clientCompany: clientCompany.trim(),
        clientContact: clientContact.trim(),
        title: title.trim(),
        summary: summary.trim(),
        currency: 'IDR',
        items: cleanItems,
        discount: Math.max(0, Math.round(Number(discount) || 0)),
        dpPercent: Math.min(100, Math.max(0, Math.round(Number(dpPercent) || 0))),
        paidAmount: Math.max(0, Math.round(Number(paidAmount) || 0)),
        status,
        issueDate,
        dueDate,
        validUntil,
        terms,
        paymentInfo: paymentInfo.trim(),
        waMessage: waMessage.trim(),
        sourceNotes: sourceNotes.trim(),
        shareChecklist,
        initialTodos: editingDoc ? undefined : initialTodos,
      },
    })
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={editingDoc ? `${t('devdesk.editDoc')} · ${editingDoc.docNumber}` : t('devdesk.newDoc')}
      size="lg"
      footer={
        <>
          <div className="mr-auto text-[0.75rem] text-[var(--text-secondary)]">
            {t('devdesk.totalLabel')}: <strong className="panel-mono text-[var(--win-text)]">Rp {total.toLocaleString('id-ID')}</strong>
            {Number(dpPercent) > 0 && Number(dpPercent) < 100 ? (
              <span className="panel-mono ml-2 text-[var(--panel-primary-text)]">(DP {dpPercent}%: Rp {dpNum.toLocaleString('id-ID')})</span>
            ) : null}
          </div>
          <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!title.trim()} loading={saveDocMut.isPending} onClick={handleSave}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <Field label={t('devdesk.kindLabel')}>
            <Select
              value={kind}
              onChange={(v) => setKind(v as DevDocKind)}
              options={[
                { value: 'quotation', label: t('devdesk.kind.quotation') },
                { value: 'invoice', label: t('devdesk.kind.invoice') },
              ]}
            />
          </Field>
          <Field label={t('devdesk.docNumberLabel')}>
            <TextInput mono value={docNumber} onChange={(e) => setDocNumber(e.target.value)} placeholder={t('devdesk.autoNumber')} />
          </Field>
          <Field label={t('docker.colStatus')}>
            <Select
              value={status}
              onChange={(v) => setStatus(v as DevDocStatus)}
              options={[
                { value: 'draft', label: t('devdesk.status.draft') },
                { value: 'sent', label: t('devdesk.status.sent') },
                { value: 'accepted', label: t('devdesk.status.accepted') },
                { value: 'dp_paid', label: t('devdesk.status.dp_paid') },
                { value: 'paid', label: t('devdesk.status.paid') },
                { value: 'cancelled', label: t('devdesk.status.cancelled') },
              ]}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <Field label={t('devdesk.clientLabel')}>
            <TextInput value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={t('devdesk.clientPlaceholder')} />
          </Field>
          <Field label={t('devdesk.companyLabel')}>
            <TextInput value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} />
          </Field>
          <Field label={t('devdesk.contactLabel')}>
            <TextInput mono value={clientContact} onChange={(e) => setClientContact(e.target.value)} />
          </Field>
        </div>

        <Field label={t('devdesk.titleLabel')}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('devdesk.titlePlaceholder')} />
        </Field>

        <Field label={t('devdesk.summaryHeading')}>
          <Textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>

        <div className="space-y-2 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[0.75rem] font-semibold text-[var(--win-text)]">{t('devdesk.itemsHeading')}</span>
            <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.75} />} onClick={() => setItems((p) => [...p, { ...EMPTY_ITEM }])}>
              {t('devdesk.addItem')}
            </Button>
          </div>
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-2 rounded-md border border-[var(--win-border)] bg-[var(--win-bar)] p-2.5 sm:grid-cols-[minmax(0,1fr)_72px_92px_132px_auto]">
              <div className="space-y-1.5">
                <TextInput value={it.title} onChange={(e) => updateItem(idx, { title: e.target.value })} placeholder={t('devdesk.itemTitlePh')} />
                <TextInput value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} placeholder={t('devdesk.itemDescPh')} />
              </div>
              <TextInput mono type="number" min={1} value={String(it.qty)} onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })} />
              <TextInput value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} placeholder={t('devdesk.unitPh')} />
              <TextInput mono type="number" min={0} step={50000} value={String(it.unitPrice)} onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })} />
              <IconButton size="sm" variant="ghost" tone="danger" label={t('common.delete')} disabled={items.length <= 1} onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}>
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Field label={t('devdesk.discountLabel')}>
            <TextInput mono type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </Field>
          <Field label={t('devdesk.dpPercentLabel')}>
            <TextInput mono type="number" min={0} max={100} value={dpPercent} onChange={(e) => setDpPercent(e.target.value)} />
          </Field>
          <Field label={t('devdesk.paidLabel')}>
            <TextInput mono type="number" min={0} value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
          </Field>
          <Field label={kind === 'invoice' ? t('devdesk.dueDate') : t('devdesk.validUntil')}>
            <TextInput mono type="date" value={kind === 'invoice' ? dueDate : validUntil} onChange={(e) => (kind === 'invoice' ? setDueDate(e.target.value) : setValidUntil(e.target.value))} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Field label={t('devdesk.paymentInfoLabel')}>
            <Textarea rows={3} value={paymentInfo} onChange={(e) => setPaymentInfo(e.target.value)} placeholder={t('devdesk.paymentInfoPh')} />
          </Field>
          <Field label={t('devdesk.termsLabel')} hint={t('devdesk.termsHint')}>
            <Textarea rows={3} value={termsText} onChange={(e) => setTermsText(e.target.value)} />
          </Field>
        </div>

        <Field label={t('devdesk.waMessageLabel')}>
          <div className="space-y-1.5">
            <Textarea rows={3} value={waMessage} onChange={(e) => setWaMessage(e.target.value)} />
            {waMessage.trim() ? (
              <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" strokeWidth={1.75} />} onClick={() => void navigator.clipboard.writeText(waMessage).then(() => toast.success(t('common.copied')))}>
                {t('devdesk.copyWa')}
              </Button>
            ) : null}
          </div>
        </Field>

        <div className="flex items-center justify-between rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2">
          <span className="text-[0.75rem] text-[var(--win-text)]">{t('devdesk.shareChecklistLabel')}</span>
          <ToggleSwitch checked={shareChecklist} onChange={() => setShareChecklist((v) => !v)} label={t('devdesk.shareChecklistLabel')} />
        </div>

        {!editingDoc && initialTodos.length > 0 ? (
          <p className="text-[0.75rem] text-[var(--panel-primary-text)]">
            {t('devdesk.initialTodosNote', { count: initialTodos.length })}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
