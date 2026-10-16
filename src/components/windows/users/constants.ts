
export const ROLE_TONES: Record<string, 'warning' | 'info' | 'neutral'> = {
  superadmin: 'warning',
  admin: 'info',
  user: 'neutral',
}

export const STATUS_TONES: Record<string, 'success' | 'danger' | 'warning'> = {
  active: 'success',
  suspended: 'danger',
  pending: 'warning',
}

const ROLE_OPTIONS = [
  { value: 'user', labelKey: 'users.roleUser' },
  { value: 'admin', labelKey: 'users.roleAdmin' },
  { value: 'superadmin', labelKey: 'users.roleSuperadmin' },
]

export const ROLE_SELECT_OPTIONS = (t: (key: string) => string, allowed?: string[]) => ROLE_OPTIONS.filter((role) => !allowed || allowed.includes(role.value)).map((role) => ({
  value: role.value,
  label: t(role.labelKey),
  description: role.value,
}))
