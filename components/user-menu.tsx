'use client'

import * as React from 'react'
import Image from 'next/image'
import { type Session } from 'next-auth'
import { signOut } from 'next-auth/react'
import { toast } from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { IconSpinner } from '@/components/ui/icons'
import { e2eSignOut } from '@/app/actions'
import { useRouter } from 'next/navigation'

export interface UserMenuProps {
  user: Session['user']
}

const IS_E2E = process.env.NEXT_PUBLIC_E2E_MODE === '1'

function getUserInitials(name?: string | null) {
  if (!name) return 'U'
  const [firstName, lastName] = name.split(' ')
  return lastName ? `${firstName[0]}${lastName[0]}` : firstName.slice(0, 2)
}

export function UserMenu({ user }: UserMenuProps) {
  const router = useRouter()
  const walletAddress = (user as any)?.walletAddress as string | undefined
  const displayName =
    user?.name ??
    (walletAddress
      ? `Wallet ${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
      : 'User')

  const [isSigningOut, startSignOut] = React.useTransition()

  const handleCopyProfile = React.useCallback(async () => {
    try {
      const origin =
        typeof window !== 'undefined'
          ? window.location.origin
          : 'https://icm.fyi'
      const profileUrl = `${origin}/profile/${user?.id ?? 'me'}`
      await navigator.clipboard.writeText(profileUrl)
      toast.success('Profile link copied to clipboard.')
    } catch (error) {
      console.error('Copy profile link failed', error)
      toast.error('Unable to copy profile link.')
    }
  }, [user?.id])

  const handleSettings = React.useCallback(() => {
    toast('Settings are coming soon.', {
      icon: '🛠️'
    })
  }, [])

  const handleSignOut = React.useCallback(() => {
    if (IS_E2E) {
      startSignOut(async () => {
        try {
          await e2eSignOut()
        } catch (error) {
          console.error('user-menu: e2e sign-out failed', error)
        } finally {
          router.replace('/sign-in')
        }
      })
      return
    }
    void signOut({ callbackUrl: '/sign-in' })
  }, [router, startSignOut])

  return (
    <div className="flex items-center justify-between">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="pl-0">
            {user?.image ? (
              <Image
                className="size-7 select-none rounded-full ring-1 ring-zinc-100/10 transition-opacity duration-300 hover:opacity-80"
                src={
                  user.image
                    ? `${user.image}${user.image.includes('?') ? '&' : '?'}s=60`
                    : ''
                }
                alt={displayName}
                height={48}
                width={48}
              />
            ) : (
              <div className="flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-muted/60 text-xs font-medium uppercase text-muted-foreground">
                {getUserInitials(displayName)}
              </div>
            )}
            <span className="ml-2 text-sm font-medium">{displayName}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent sideOffset={8} align="end" className="w-52">
          <DropdownMenuLabel className="flex flex-col items-start">
            <span className="text-xs font-semibold text-foreground">
              {displayName}
            </span>
            {walletAddress ? (
              <span className="text-[11px] text-muted-foreground">
                {walletAddress}
              </span>
            ) : user?.email ? (
              <span className="text-[11px] text-muted-foreground">
                {user.email}
              </span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-xs"
            onSelect={() => {
              void handleCopyProfile()
            }}
          >
            Copy profile link
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onSelect={() => {
              handleSettings()
            }}
          >
            Settings (soon)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-xs text-red-500 focus:text-red-500"
            disabled={isSigningOut}
            onSelect={() => {
              handleSignOut()
            }}
          >
            {isSigningOut && (
              <IconSpinner className="mr-2 size-3 animate-spin text-red-500" />
            )}
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
