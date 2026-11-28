import { useState } from 'react'
import { toast } from 'sonner'
import { uploadDocImage } from '@/api/docs'
import type { AIImageRef } from '@/api/studio'
import { useI18n } from '@/lib/i18n'

export const MAX_AI_IMAGES = 8

// The pixel size helps the model choose where a picture fits; unknown stays 0
function readSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    const done = (width: number, height: number) => {
      URL.revokeObjectURL(url)
      resolve({ width, height })
    }
    img.onload = () => done(img.naturalWidth, img.naturalHeight)
    img.onerror = () => done(0, 0)
    img.src = url
  })
}

export async function uploadImageRef(file: File): Promise<AIImageRef> {
  const [{ url }, size] = await Promise.all([uploadDocImage(file), readSize(file)])
  return { url, name: file.name, ...size }
}

export const imageFilesOf = (list: Iterable<File> | ArrayLike<File> | null | undefined) =>
  Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))

// Pictures waiting to go along with the next prompt: chosen, pasted or dropped
export function useImageAttachments() {
  const { t } = useI18n()
  const [images, setImages] = useState<AIImageRef[]>([])
  const [uploading, setUploading] = useState(0)

  const add = async (files: File[]) => {
    const picked = files.slice(0, Math.max(0, MAX_AI_IMAGES - images.length - uploading))
    if (picked.length < files.length) toast.error(t('attach.limit', { count: MAX_AI_IMAGES }))
    if (picked.length === 0) return
    setUploading((n) => n + picked.length)
    for (const file of picked) {
      try {
        const ref = await uploadImageRef(file)
        setImages((prev) => (prev.some((p) => p.url === ref.url) ? prev : [...prev, ref]))
      } catch {
        toast.error(t('docs.imageFailed'))
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  return {
    images,
    uploading: uploading > 0,
    add,
    remove: (url: string) => setImages((prev) => prev.filter((p) => p.url !== url)),
    clear: () => setImages([]),
  }
}

export type ImageAttachments = ReturnType<typeof useImageAttachments>
