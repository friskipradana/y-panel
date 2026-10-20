import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

export type Language = 'id' | 'en'

type TranslationParams = Record<string, string | number | undefined | null>
type TranslationDictionary = Record<string, string>

const STORAGE_KEY = 'reneo-language'

// Each language is served in two parts (vite.config.ts, localeSplit): the text of the public pages, which is all a visitor
// needs before logging in, and the rest, for the desktop and its windows. A first visit loads one part of one language.
const dictionaries: Partial<Record<Language, TranslationDictionary>> = {}
const parts: Partial<Record<Language, { public?: boolean; rest?: boolean }>> = {}

const loaders: Record<Language, Record<'public' | 'rest', () => Promise<{ default: TranslationDictionary }>>> = {
  id: { public: () => import('virtual:locale/id/public'), rest: () => import('virtual:locale/id/rest') },
  en: { public: () => import('virtual:locale/en/public'), rest: () => import('virtual:locale/en/rest') },
}

// the provider and the screens that wait for the whole dictionary listen here
let version = 0
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const getVersion = () => version

async function loadPart(language: Language, part: 'public' | 'rest') {
  const state = (parts[language] ??= {})
  if (state[part]) return
  const module = await loaders[language][part]()
  dictionaries[language] = { ...dictionaries[language], ...module.default }
  state[part] = true
  version += 1
  listeners.forEach((listener) => listener())
}

// 'public' is enough for the public pages; 'all' is the whole language, for the desktop
export async function loadLanguage(language: Language, scope: 'public' | 'all' = 'public') {
  await loadPart(language, 'public')
  if (scope === 'all') await loadPart(language, 'rest')
}

export function isLanguageComplete(language: Language) {
  return !!parts[language]?.rest
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

  // text that arrives later (the rest of the language) re-renders everything that reads it
  const loadedVersion = useSyncExternalStore(subscribe, getVersion)

  const value = useMemo<I18nContextValue>(() => ({
    language,
    // a switch made on the desktop waits for the whole language, one made on a public page only for its text
    setLanguage: (next) => {
      void loadLanguage(next, isLanguageComplete(language) ? 'all' : 'public').then(() => {
        setLanguageState(next)
        void loadLanguage(next, 'all')
      })
    },
    t: (key, params) => translate(language, key, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [language, loadedVersion])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// true once the whole language is in; asks for it while `needed` (the desktop, a signed-in account)
export function useLanguageComplete(needed: boolean) {
  const { language } = useI18n()
  useSyncExternalStore(subscribe, getVersion)
  useEffect(() => {
    if (needed) void loadLanguage(language, 'all')
  }, [needed, language])
  return isLanguageComplete(language)
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider')
  return context
}
