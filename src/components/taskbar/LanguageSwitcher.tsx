import { useState, useRef, useEffect } from 'react'
import { Languages, ChevronDown, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useI18n, type Language } from '@/lib/i18n'

const LANGUAGES: { code: Language; label: string; name: string }[] = [
  { code: 'id', label: 'ID', name: 'Bahasa Indonesia' },
  { code: 'en', label: 'EN', name: 'English' },
]

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const currentLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0]

  return (
    <div className="taskbar-lang-wrapper" ref={containerRef}>
      <button
        type="button"
        id="taskbar-language-button"
        className={`taskbar-lang-btn ${isOpen ? 'taskbar-lang-btn--open' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={t('language.label')}
      >
        <Languages size={13} className="taskbar-lang-btn__icon" />
        <span className="taskbar-lang-btn__code">{currentLang.label}</span>
        <ChevronDown size={12} className={`taskbar-lang-btn__chevron ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="taskbar-lang-dropdown"
            role="listbox"
          >
            <div className="taskbar-lang-dropdown__header">
              {t('language.label')}
            </div>
            <div className="taskbar-lang-dropdown__list">
              {LANGUAGES.map((item) => {
                const isSelected = item.code === language
                return (
                  <button
                    key={item.code}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`taskbar-lang-item ${isSelected ? 'taskbar-lang-item--selected' : ''}`}
                    onClick={() => {
                      setLanguage(item.code)
                      setIsOpen(false)
                    }}
                  >
                    <span className="taskbar-lang-item__code">{item.label}</span>
                    <span className="taskbar-lang-item__name">{item.name}</span>
                    {isSelected && <Check size={13} className="taskbar-lang-item__check" />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
