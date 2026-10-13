import { emptyProfileForm } from './tunnelForms'
import { ProfileModal } from './TunnelModals'
import type { TunnelsWindowState } from './useTunnelsWindow'

export function ProfileModalHost({ tw }: { tw: TunnelsWindowState }) {
  const {
    showProfileModal,
    setShowProfileModal,
    profileForm,
    setProfileForm,
    createProfileMut,
  } = tw
  if (!(showProfileModal)) return null

  return (
    <ProfileModal
      form={profileForm}
      setForm={setProfileForm}
      onClose={() => { setShowProfileModal(false); setProfileForm(emptyProfileForm) }}
      onSubmit={() => createProfileMut.mutate()}
      pending={createProfileMut.isPending}
    />
  )
}
