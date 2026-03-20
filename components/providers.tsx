'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { ThemeProviderProps } from 'next-themes/dist/types'

import { EntryProfileProvider } from '@/components/entry-profile-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { HeaderExtrasProvider } from '@/components/header-extras-context'
import type { EntryProfile } from '@/lib/entry-profiles'

interface ProvidersProps extends ThemeProviderProps {
  entryProfile: EntryProfile
}

export function Providers({ children, entryProfile, ...props }: ProvidersProps) {
  return (
    <NextThemesProvider {...props}>
      <EntryProfileProvider profile={entryProfile}>
        <HeaderExtrasProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </HeaderExtrasProvider>
      </EntryProfileProvider>
    </NextThemesProvider>
  )
}
