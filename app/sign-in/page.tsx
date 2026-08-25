import auth, { hasGoogleConfig, hasTwitterConfig, IS_E2E_MODE } from '@/auth'
import { LoginButton } from '@/components/login-button'
import { redirect } from 'next/navigation'
import { e2eSignIn } from '@/app/actions'
import { sanitizeCallbackUrl } from '@/lib/auth-callback'

interface SignInPageProps {
  searchParams?: Promise<{
    callbackUrl?: string
  }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const [session, resolvedSearchParams] = await Promise.all([auth(), searchParams])
  const callbackUrl = sanitizeCallbackUrl(resolvedSearchParams?.callbackUrl)
  // redirect to home if user is already logged in
  if (session?.user) {
    redirect(callbackUrl)
  }
  return (
    <div className="flex h-screen flex-col items-center justify-start pt-20 sm:pt-32">
      <div className="mx-auto w-full max-w-sm px-3 text-center sm:max-w-lg md:max-w-xl lg:max-w-3xl xl:max-w-4xl 2xl:max-w-5xl">
        <h1 className="mb-4 text-4xl font-bold">icm.fyi</h1>
        <h1 className="mb-4 text-2xl font-bold sm:text-3xl md:text-4xl">
          The Internet Capital Markets (ICM) chatbot
        </h1>
        
        <p className="mb-6 text-base leading-normal text-muted-foreground sm:text-lg">
          Find the latest ICM-related content, across DeFi, DATs, CCM, from docs, research papers, articles, YouTube videos and Pump.fun streams.
        </p>
        
        <p className="my-4"></p>
        
        <p className="text-base leading-normal text-muted-foreground sm:text-lg">
          Sign in to query your entitled creator archive, save chat history, export your
          tenant database, and create source-verified clips.
        </p>
      </div>
      
      <p className="my-4"></p>
      
      <div className="mx-auto flex w-full flex-col gap-3 px-3 sm:flex-row sm:justify-center">
        {hasTwitterConfig ? (
          <LoginButton
            loginType="twitter"
            text="Sign in with Twitter"
            callbackUrl={callbackUrl}
            showIcon
            className="w-full sm:w-auto"
          />
        ) : null}
        {hasGoogleConfig ? (
          <LoginButton
            loginType="google"
            text="Sign in with Google"
            callbackUrl={callbackUrl}
            showIcon
            className="w-full sm:w-auto"
          />
        ) : null}
      </div>
      {IS_E2E_MODE ? (
        <form action={e2eSignIn} className="mt-6">
          <button
            type="submit"
            className="text-xs font-medium text-muted-foreground underline underline-offset-4 transition hover:text-foreground"
          >
            Continue as E2E tester
          </button>
        </form>
      ) : null}
    </div>
  );
}
