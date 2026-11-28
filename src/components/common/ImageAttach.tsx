import { useRef } from 'react'
import { ImagePlus, LoaderCircle, X } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { imageFilesOf, type ImageAttachments } from '@/hooks/useImageAttachments'
import { useI18n } from '@/lib/i18n'

// Hidden file input behind a button, so the picker looks like the rest of the panel
export function ImagePickButton({
  onFiles,
  label,
  busy,
  disabled,
  multiple = true,
}: {
  onFiles: (files: File[]) => void
  label: string
  busy?: boolean
  disabled?: boolean
  multiple?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <IconButton label={label} variant="outline" disabled={disabled || busy} onClick={() => ref.current?.click()}>
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : <ImagePlus className="h-4 w-4" strokeWidth={1.75} />}
      </IconButton>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          onFiles(imageFilesOf(e.target.files))
          e.target.value = ''
        }}
      />
    </>
  )
}

// Thumbnails of the attached pictures, each removable
export function ImageChips({ attach }: { attach: ImageAttachments }) {
  const { t } = useI18n()
  if (attach.images.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2">
      {attach.images.map((img) => (
        <li key={img.url} className="relative">
          <img src={img.url} alt={img.name} title={img.name} className="h-14 w-14 rounded-lg border border-[var(--win-border)] object-cover" />
          <button
            type="button"
            className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-[var(--win-border)] bg-[var(--win-bar)] text-[var(--win-text)] hover:text-[var(--panel-danger-text)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            aria-label={t('attach.remove', { name: img.name })}
            onClick={() => attach.remove(img.url)}
          >
            <X className="h-3 w-3" strokeWidth={2} />
          </button>
        </li>
      ))}
    </ul>
  )
}
