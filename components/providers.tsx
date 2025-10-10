'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { ThemeProviderProps } from 'next-themes/dist/types'
import { PrivyProvider } from '@privy-io/react-auth'

import { TooltipProvider } from '@/components/ui/tooltip'
import { EntryProfileProvider } from '@/components/entry-profile-context'
import type { EntryProfile } from '@/lib/entry-profiles'

interface ProvidersProps extends ThemeProviderProps {
  entryProfile: EntryProfile
}

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID

export function Providers({ children, entryProfile, ...props }: ProvidersProps) {
  const content = (
    <NextThemesProvider {...props}>
      <EntryProfileProvider profile={entryProfile}>
        <TooltipProvider>{children}</TooltipProvider>
      </EntryProfileProvider>
    </NextThemesProvider>
  )

  if (!privyAppId) {
    return content
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['wallet'],
        appearance: { theme: 'dark', accentColor: '#22c55e' },
        embeddedWallets: {
          createOnLogin: 'all-users'
        }
      }}
    >
      {content}
    </PrivyProvider>
  )
}
