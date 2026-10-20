import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { TextInput, type TextInputProps } from '@/components/ui/Field'
import { useI18n } from '@/lib/i18n'

// Kolom kata sandi dengan tombol lihat/sembunyikan; tombolnya tidak ikut terkirim saat form disubmit
export function PasswordInput({ className = '', disabled, ...rest }: Omit<TextInputProps, 'type'>) {
  const { t } = useI18n()
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <TextInput {...rest} disabled={disabled} type={shown ? 'text' : 'password'} className={`!pr-10 ${className}`} />
      <IconButton
        label={shown ? t('ui.hidePassword') : t('ui.showPassword')}
        onClick={() => setShown((value) => !value)}
        disabled={disabled}
        className="absolute right-1 top-1/2 -translate-y-1/2"
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </IconButton>
    </div>
  )
}
