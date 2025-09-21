import { auth } from '@/auth'
import { LoginButton } from '@/components/login-button'
import { redirect } from 'next/navigation'
import Image from 'next/image';

export default async function SignInPage() {
  const session = await auth()
  // redirect to home if user is already logged in
  if (session?.user) {
    redirect('/')
  }
  return (
    <div className="flex flex-col h-screen justify-start items-center pt-20 sm:pt-32">
      <div className="w-full max-w-sm sm:max-w-lg md:max-w-xl lg:max-w-3xl xl:max-w-4xl 2xl:max-w-5xl px-3 mx-auto text-center">
        <h1 className="mb-4 text-4xl font-bold">mev.fyi</h1>
        <h1 className="mb-4 text-2xl sm:text-3xl md:text-4xl font-bold">
          The Flashbots-grantee Maximal Extractable Value (MEV) research chatbot
        </h1>
        
        <p className="mb-6 text-base sm:text-lg leading-normal text-muted-foreground">
          Find the latest MEV-related research, across mechanism design, auctions, information privacy, from docs, research papers, articles and YouTube videos.
        </p>
        
        <p className="my-4"></p>
        
        <p className="text-base sm:text-lg leading-normal text-muted-foreground">
          To keep our platform friendly and secure, we use GitHub or Google login solely as a spam prevention measure. 
          We promise not to collect any data from you! 
        </p>

        <p className="text-base sm:text-lg leading-normal text-muted-foreground">
          Once you&apos;re logged in, you&apos;re all set to explore without any hassle.
        </p>  

        <p className="text-base sm:text-lg leading-normal text-muted-foreground">
          Thanks for helping us keep the community safe and sound!
        </p>
      </div>
      
      <p className="my-4"></p>
      
      <div className="w-full px-3 mx-auto flex justify-center">
        <LoginButton loginType="github" text="Login with GitHub" showIcon />
        <LoginButton loginType="google" text="Login with Google" showIcon />
      </div>
    </div>
  );
}
