'use client'

import React, { createContext, useContext, useMemo } from 'react'
import type { EntryProfile } from '@/lib/entry-profiles'

const EntryProfileContext = createContext<EntryProfile | null>(null)

export function EntryProfileProvider({
  profile,
  children
}: {
  profile: EntryProfile
  children: React.ReactNode
}) {
  const value = useMemo(() => profile, [profile])
  return <EntryProfileContext.Provider value={value}>{children}</EntryProfileContext.Provider>
}

export function useEntryProfile() {
  const ctx = useContext(EntryProfileContext)
  if (!ctx) {
    throw new Error('useEntryProfile must be used within an EntryProfileProvider')
  }
  return ctx
}
