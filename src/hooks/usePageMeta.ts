import { useEffect } from 'react'

// Keeps the tab title and description in step with the public page on screen (the
// agent injects the same values server-side for crawlers that do not run scripts).
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    const previousTitle = document.title
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const previousDescription = meta?.content
    if (title) document.title = title
    if (description && meta) meta.content = description
    return () => {
      document.title = previousTitle
      if (meta && previousDescription !== undefined) meta.content = previousDescription
    }
  }, [title, description])
}
