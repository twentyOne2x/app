'use client'

import React from 'react'
import { signIn } from 'next-auth/react'
import { toast } from 'react-hot-toast'

import { Button, type ButtonProps } from '@/components/ui/button'
import { IconGoogle, IconSpinner, IconTwitter } from '@/components/ui/icons'
import { sanitizeCallbackUrl } from '@/lib/auth-callback'

interface LoginButtonProps extends ButtonProps {
  loginType: 'twitter' | 'google'
  text?: string
  showIcon?: boolean
  callbackUrl?: string
}

function getLoginMetadata(loginType: LoginButtonProps['loginType']) {
  if (loginType === 'google') {
    return {
      provider: 'google',
      label: 'Google',
      icon: IconGoogle
    }
  }

  return {
    provider: 'twitter',
    label: 'Twitter',
    icon: IconTwitter
  }
}

export function LoginButton({
  loginType,
  text,
  showIcon = true,
  className,
  callbackUrl,
  ...props
}: LoginButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false)
  const metadata = getLoginMetadata(loginType)
  const Icon = metadata.icon

  const handleLogin = React.useCallback(async () => {
    setIsLoading(true)
    try {
      await signIn(metadata.provider, {
        callbackUrl: sanitizeCallbackUrl(callbackUrl)
      })
    } catch (error) {
      console.error(`${metadata.label} sign-in failed`, error)
      toast.error(`Unable to sign in with ${metadata.label}. Please try again.`)
      setIsLoading(false)
    }
  }, [callbackUrl, metadata.label, metadata.provider])

  return (
    <Button
      variant="outline"
      onClick={() => void handleLogin()}
      disabled={isLoading}
      className={className}
      {...props}
    >
      {isLoading ? <IconSpinner className="mr-2 animate-spin" /> : showIcon ? <Icon className="mr-2" /> : null}
      {text ?? `Sign in with ${metadata.label}`}
    </Button>
  )
}
