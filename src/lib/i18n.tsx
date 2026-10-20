import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type Language = 'id' | 'en'

type TranslationParams = Record<string, string | number | undefined | null>
type TranslationDictionary = Record<string, string>

const STORAGE_KEY = 'reneo-language'

// Each language is its own file and is fetched when it is needed, so a first visit loads one of them, not both.
// Indonesian is also the fallback for a key the other language lacks, and is fetched in the background then.
const dictionaries: Partial<Record<Language, TranslationDictionary>> = {}

const loaders: Record<Language, () => Promise<TranslationDictionary>> = {
  id: () => import('@/lib/locales/id').then((module) => module.id),
  en: () => import('@/lib/locales/en').then((module) => module.en),
}

export async function loadLanguage(language: Language) {
  if (!dictionaries[language]) dictionaries[language] = await loaders[language]()
  if (language !== 'id' && !dictionaries.id) void loaders.id().then((dictionary) => { dictionaries.id = dictionary })
}

export function getInitialLanguage(): Language {
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
  return interpolate(dictionaries[language]?.[key] ?? dictionaries.id?.[key] ?? key, params)
}

// For non-component code: the current language is whatever the language switch stored
export function translateNow(key: string, params?: TranslationParams) {
  return translate(getInitialLanguage(), key, params)
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
    setLanguage: (next) => { void loadLanguage(next).then(() => setLanguageState(next)) },
    t: (key, params) => translate(language, key, params),
  }), [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider')
  return context
}
