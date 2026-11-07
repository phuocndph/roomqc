import { useEffect, useRef } from 'react'
import { useForm, useFormState } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { profileFormSchema, type ProfileFormData } from '@/lib/validations/user.schemas'

type ProfileSource = {id: string; full_name?: string | null; phone?: string | null; avatar_url?: string | null}
export function useSelfProfileForm(user?: ProfileSource | null) {
  const form = useForm<ProfileFormData>({resolver: zodResolver(profileFormSchema),
    defaultValues: {fullName: '', phone: '', avatarUrl: ''}})
  // RHF keepDirtyValues requires a dirtyFields subscription. Ref keeps edits
  // out of effect dependencies so typing does not repeatedly reset the form.
  const {dirtyFields} = useFormState({control: form.control})
  const dirty = useRef(dirtyFields); dirty.current = dirtyFields
  const hydratedIdentity = useRef<string | undefined>()
  const {reset} = form
  useEffect(() => {
    const sameIdentity = hydratedIdentity.current === user?.id
    reset({fullName: user?.full_name || '', phone: user?.phone || '', avatarUrl: user?.avatar_url || ''},
      {keepDirtyValues: sameIdentity && Object.keys(dirty.current).length > 0})
    hydratedIdentity.current = user?.id
  }, [user?.id, user?.full_name, user?.phone, user?.avatar_url, reset])
  return form
}
