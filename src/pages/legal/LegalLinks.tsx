import { Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/lib/i18n'

const LINK_CLASS =
  'text-[var(--panel-info-text)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'

// A sentence with {terms} and {privacy} in it, where both words become links to the legal pages
export function LegalLinks({ messageKey }: { messageKey: 'legal.order.agree' | 'landing.faq.more' }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const link = (path: string, label: string) => (
    <a
      href={path}
      onClick={(e) => {
        e.preventDefault()
        navigate(path)
      }}
      className={LINK_CLASS}
    >
      {label}
    </a>
  )
  const parts = t(messageKey, { terms: '{terms}', privacy: '{privacy}' }).split(/(\{terms\}|\{privacy\})/)
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part === '{terms}' ? link('/terms', t('legal.link.terms')) : part === '{privacy}' ? link('/privacy', t('legal.link.privacy')) : part}
        </Fragment>
      ))}
    </>
  )
}
