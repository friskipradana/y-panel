import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { id } from '@/lib/locales/id'
import { en } from '@/lib/locales/en'

export type Language = 'id' | 'en'

type TranslationParams = Record<string, string | number | undefined | null>
type TranslationDictionary = Record<string, string>

const STORAGE_KEY = 'ypanel-language'

const dictionaries: Record<Language, TranslationDictionary> = { id, en }

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'id'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'id' || stored === 'en') return stored
  return window.navigator.language.toLowerCase().startsWith('id') ? 'id' : 'en'
}

function interpolate(template: string, params?: TranslationParams) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`))
}

export function translate(language: Language, key: string, params?: TranslationParams) {
  return interpolate(dictionaries[language][key] ?? dictionaries.id[key] ?? key, params)
}

export function windowTitleKey(kind: string) {
  return `window.${kind}`
}

type I18nContextValue = {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: string, params?: TranslationParams) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage)

  useEffect(() => {
    document.documentElement.lang = language
    window.localStorage.setItem(STORAGE_KEY, language)
  }, [language])

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage: setLanguageState,
    t: (key, params) => interpolate(dictionaries[language][key] ?? dictionaries.id[key] ?? key, params),
  }), [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider')
  return context
}
