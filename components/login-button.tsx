'use client'; // Mark as client component

import React from 'react';
import { signIn } from 'next-auth/react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { IconGitHub, IconSpinner, IconGoogle } from '@/components/ui/icons';

interface LoginButtonProps extends ButtonProps {
  loginType: 'github' | 'google';
  text?: string;
  showIcon?: boolean;
}

export function LoginButton({
  loginType,
  text = loginType === 'github' ? 'Login with GitHub' : 'Login with Google',
  showIcon = true,
  className,
  ...props
}: LoginButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleLogin = () => {
    setIsLoading(true);
    signIn(loginType, { callbackUrl: `/` });
  };

  return (
    <Button
      variant="outline"
      onClick={handleLogin}
      disabled={isLoading}
      className={className}
      {...props}
    >
      {isLoading ? (
        <IconSpinner className="mr-2 animate-spin" />
      ) : showIcon && (loginType === 'github' ? <IconGitHub className="mr-2" /> : <IconGoogle className="mr-2" />)}
      {text}
    </Button>
  );
}
