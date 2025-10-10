import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import EntryAccessForm from './entry-form'
import { ENTRY_PROFILE_COOKIE, getEntryProfileByCode, DEFAULT_ENTRY_PROFILE_CODE } from '@/lib/entry-profiles'

export const metadata: Metadata = {
  title: 'Access - icm.fyi',
  description: 'Unlock a personalized ICM chatbot experience with your access code.'
}

interface AccessPageProps {
  searchParams: Record<string, string | string[] | undefined>
}

const isSafeNextPath = (next?: string | string[]) => {
  if (!next) return false
  const value = Array.isArray(next) ? next[0] : next
  if (!value) return false
  return value.startsWith('/') && !value.startsWith('//')
}

export default function AccessPage({ searchParams }: AccessPageProps) {
  const cookieStore = cookies()
  const existingCode = cookieStore.get(ENTRY_PROFILE_COOKIE)?.value
  const profile = getEntryProfileByCode(existingCode)

  if (profile.code !== DEFAULT_ENTRY_PROFILE_CODE && profile.code === existingCode) {
    const fallbackPath = '/'
    const nextPath = isSafeNextPath(searchParams?.next) ? (Array.isArray(searchParams?.next) ? searchParams.next[0] : searchParams.next) : fallbackPath
    redirect(nextPath || fallbackPath)
  }

  const redirectTo =
    isSafeNextPath(searchParams?.next) && typeof searchParams?.next === 'string'
      ? searchParams.next
      : '/'

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-zinc-950 to-zinc-900 px-6 py-12">
      <EntryAccessForm redirectTo={redirectTo} />
    </div>
  )
}
