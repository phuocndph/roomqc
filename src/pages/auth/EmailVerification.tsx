import { EmailAuthForm } from '@/components/auth/EmailAuthForm'

export default function EmailVerification({ invite = false }: { invite?: boolean }) {
  return <main className="min-h-screen flex items-center justify-center bg-background p-4"><EmailAuthForm mode={invite ? 'invite' : 'signup'} /></main>
}
