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
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const isSafeNextPath = (next?: string | string[]) => {
  if (!next) return false
  const value = Array.isArray(next) ? next[0] : next
  if (!value) return false
  return value.startsWith('/') && !value.startsWith('//')
}

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const [cookieStore, resolvedSearchParams] = await Promise.all([cookies(), searchParams])
  const existingCode = cookieStore.get(ENTRY_PROFILE_COOKIE)?.value
  const profile = getEntryProfileByCode(existingCode)

  if (profile.code !== DEFAULT_ENTRY_PROFILE_CODE && profile.code === existingCode) {
    const fallbackPath = '/'
    const nextPath = isSafeNextPath(resolvedSearchParams?.next) ? (Array.isArray(resolvedSearchParams?.next) ? resolvedSearchParams.next[0] : resolvedSearchParams.next) : fallbackPath
    redirect(nextPath || fallbackPath)
  }

  const redirectTo =
    isSafeNextPath(resolvedSearchParams?.next) && typeof resolvedSearchParams?.next === 'string'
      ? resolvedSearchParams.next
      : '/'

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-zinc-950 to-zinc-900 px-6 py-12">
      <EntryAccessForm redirectTo={redirectTo} />
    </div>
  )
}
