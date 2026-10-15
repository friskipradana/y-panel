import type { PanelUser } from '@/api/agent'

// Mirrors users.CanManage / users.CanAssignRole in the agent; the agent stays the authority
export function canManageUser(actor: { id?: number; role?: string } | null | undefined, target: PanelUser): boolean {
  if (!actor?.role || actor.id === target.id) return false
  if (actor.role === 'superadmin') return true
  return actor.role === 'admin' && target.role === 'user'
}

export function grantableRoles(actorRole?: string): string[] {
  if (actorRole === 'superadmin') return ['user', 'admin']
  if (actorRole === 'admin') return ['user']
  return []
}
