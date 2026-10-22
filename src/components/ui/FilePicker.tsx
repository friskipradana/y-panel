import { useRef } from 'react'
import { FolderOpen, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { useI18n } from '@/lib/i18n'

interface FilePickerProps {
  file: File | null
  onChange: (file: File | null) => void
  /** The file types the browser offers, as for an input of type file */
  accept?: string
  disabled?: boolean
  id?: string
}

const sizeOf = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

// Choosing a file: a button of the kit, the name and size of what was chosen, and a way to drop it. The browser's own control says
// "Choose File" in the language of the browser and cannot be styled, so it is kept out of sight.
export function FilePicker({ file, onChange, accept, disabled, id }: FilePickerProps) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)

  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        hidden
        disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      <Button type="button" variant="outline" icon={<FolderOpen className="h-3.5 w-3.5" />} disabled={disabled} onClick={() => input.current?.click()} className="shrink-0">
        {t('ui.chooseFile')}
      </Button>
      {file ? (
        <>
          <span className="min-w-0 flex-1 truncate text-[0.75rem] text-[var(--win-text)]" title={file.name}>
            <span className="panel-mono">{file.name}</span>
            <span className="ml-2 text-[var(--text-secondary)]">{sizeOf(file.size)}</span>
          </span>
          <IconButton
            label={t('ui.removeFile')}
            disabled={disabled}
            onClick={() => {
              onChange(null)
              if (input.current) input.current.value = ''
            }}
          >
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[0.75rem] text-[var(--text-secondary)]">{t('ui.noFileChosen')}</span>
      )}
    </div>
  )
}
