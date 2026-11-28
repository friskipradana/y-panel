import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Bot, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { generateDocWithAI, type DocKind } from '@/api/docs'
import { ImageChips, ImagePickButton } from '@/components/common/ImageAttach'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { useImageAttachments } from '@/hooks/useImageAttachments'
import { useI18n } from '@/lib/i18n'
import { apiError } from './useDocsWindow'

// Ask the AI to rework the text being edited; nothing is saved until the author saves, and the last answer can be undone
export function DocAiRevise({
  kind,
  title,
  content,
  onApply,
}: {
  kind: DocKind
  title: string
  content: string
  onApply: (next: { title: string; content: string }) => void
}) {
  const { t, language } = useI18n()
  const [instruction, setInstruction] = useState('')
  const [before, setBefore] = useState<{ title: string; content: string } | null>(null)
  const attach = useImageAttachments()

  const revise = useMutation({
    mutationFn: () =>
      generateDocWithAI({
        kind,
        topic: title,
        instructions: instruction.trim() || t('docs.revise.placeImages'),
        language: language === 'en' ? 'en' : 'id',
        images: attach.images.length > 0 ? attach.images : undefined,
        // an empty article is written from the instruction instead
        current: content.trim() ? { title, content } : undefined,
      }),
    onSuccess: (res) => {
      if (!res.draft) return
      setBefore({ title, content })
      onApply({ title: res.draft.title || title, content: res.draft.content })
      setInstruction('')
      attach.clear()
      toast.success(t('docs.revise.done'))
    },
    onError: (e: unknown) => toast.error(t('docs.aiFailed'), { description: apiError(e, t('docs.aiFailed')) }),
  })

  const ready = !attach.uploading && !revise.isPending && (!!instruction.trim() || attach.images.length > 0)

  return (
    <div className="space-y-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-2.5">
      <ImageChips attach={attach} />
      <div className="flex flex-wrap items-center gap-2">
        <ImagePickButton label={t('attach.add')} busy={attach.uploading} disabled={revise.isPending} onFiles={(f) => void attach.add(f)} />
        <div className="min-w-[12rem] flex-1">
          <TextInput
            value={instruction}
            disabled={revise.isPending}
            aria-label={t('docs.revise.label')}
            placeholder={t('docs.revise.label')}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready) revise.mutate()
            }}
          />
        </div>
        <Button size="sm" variant="outline" loading={revise.isPending} disabled={!ready} icon={<Bot className="h-3.5 w-3.5" strokeWidth={1.75} />} onClick={() => revise.mutate()}>
          {t('docs.revise.run')}
        </Button>
        {before ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
            onClick={() => {
              onApply(before)
              setBefore(null)
            }}
          >
            {t('docs.revise.undo')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
