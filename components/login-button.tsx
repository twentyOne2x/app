 'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { usePrivy } from '@privy-io/react-auth'
import { toast } from 'react-hot-toast'

import { Button, type ButtonProps } from '@/components/ui/button'
import { IconSpinner, IconTwitter, IconWallet } from '@/components/ui/icons'

interface LoginButtonProps extends ButtonProps {
  loginType: 'twitter' | 'privy'
  text?: string
  showIcon?: boolean
}

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID

function TwitterLoginButton({ loginType: _loginType, text, showIcon = true, className, ...props }: LoginButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false)

  const handleTwitterLogin = React.useCallback(async () => {
    setIsLoading(true)
    try {
      await signIn('twitter', { callbackUrl: '/' })
    } catch (error) {
      console.error('Twitter sign-in failed', error)
      toast.error('Unable to sign in with Twitter. Please try again.')
      setIsLoading(false)
    }
  }, [])

  return (
    <Button
      variant="outline"
      onClick={() => void handleTwitterLogin()}
      disabled={isLoading}
      className={className}
      {...props}
    >
      {isLoading ? <IconSpinner className="mr-2 animate-spin" /> : showIcon ? <IconTwitter className="mr-2" /> : null}
      {text ?? 'Sign in with Twitter'}
    </Button>
  )
}

function PrivyLoginButtonConfigured({ text, showIcon = true, className, ...props }: Omit<LoginButtonProps, 'loginType'>) {
  const router = useRouter()
  const [isLoading, setIsLoading] = React.useState(false)
  const privy = usePrivy()

  const handlePrivyLogin = React.useCallback(async () => {
    setIsLoading(true)
    try {
      await privy.login()
      const token = await privy.getAccessToken()
      if (!token) {
        throw new Error('Missing access token from Privy')
      }
      const result = await signIn('privy', {
        privyToken: token,
        redirect: false,
        callbackUrl: '/'
      })
      if (result?.error) {
        throw new Error(result.error)
      }
      if (result?.url) {
        router.push(result.url)
      } else {
        router.refresh()
      }
    } catch (error) {
      console.error('Privy wallet sign-in failed', error)
      toast.error('Unable to authenticate with Privy. Please try again.')
      setIsLoading(false)
    }
  }, [privy, router])

  return (
    <Button
      variant="outline"
      onClick={() => void handlePrivyLogin()}
      disabled={isLoading || !PRIVY_APP_ID}
      className={className}
      {...props}
    >
      {isLoading ? <IconSpinner className="mr-2 animate-spin" /> : showIcon ? <IconWallet className="mr-2" /> : null}
      {text ?? 'Connect wallet with Privy'}
    </Button>
  )
}

export function LoginButton(props: LoginButtonProps) {
  if (props.loginType === 'privy') {
    if (!PRIVY_APP_ID) {
      const { text, className, showIcon, ...rest } = props
      return (
        <Button variant="outline" disabled className={className} {...rest}>
          {text ?? 'Privy wallet (unavailable)'}
        </Button>
      )
    }
    const { loginType: _loginType, ...rest } = props
    return <PrivyLoginButtonConfigured {...rest} />
  }
  return <TwitterLoginButton {...props} />
}
