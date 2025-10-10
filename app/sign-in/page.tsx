import { auth } from '@/auth'
import { LoginButton } from '@/components/login-button'
import { redirect } from 'next/navigation'

export default async function SignInPage() {
  const session = await auth()
  // redirect to home if user is already logged in
  if (session?.user) {
    redirect('/')
  }
  return (
    <div className="flex flex-col h-screen justify-start items-center pt-20 sm:pt-32">
      <div className="w-full max-w-sm sm:max-w-lg md:max-w-xl lg:max-w-3xl xl:max-w-4xl 2xl:max-w-5xl px-3 mx-auto text-center">
        <h1 className="mb-4 text-4xl font-bold">icm.fyi</h1>
        <h1 className="mb-4 text-2xl sm:text-3xl md:text-4xl font-bold">
          The Internet Capital Markets (ICM) chatbot
        </h1>
        
        <p className="mb-6 text-base sm:text-lg leading-normal text-muted-foreground">
          Find the latest ICM-related content, across DeFi, DATs, CCM, from docs, research papers, articles, YouTube videos and Pump.fun streams.
        </p>
        
        <p className="my-4"></p>
        
        <p className="text-base sm:text-lg leading-normal text-muted-foreground">
          To keep access invitational and prevent spoofing, please authenticate with Twitter or connect a verified wallet.
          We only use this to understand who&apos;s testing the product—nothing more.
        </p>

        <p className="text-base sm:text-lg leading-normal text-muted-foreground">
          Wallet logins are powered by Privy, so both Solana and EVM users can come straight in.
        </p>

        <p className="text-base sm:text-lg leading-normal text-muted-foreground">
          Once you&apos;re authenticated, you can explore every feature with full context.
        </p>
      </div>
      
      <p className="my-4"></p>
      
      <div className="w-full px-3 mx-auto flex flex-col gap-3 sm:flex-row sm:justify-center">
        <LoginButton loginType="twitter" text="Sign in with Twitter" showIcon className="w-full sm:w-auto" />
        <LoginButton loginType="privy" text="Connect wallet with Privy" showIcon className="w-full sm:w-auto" />
      </div>
    </div>
  );
}
