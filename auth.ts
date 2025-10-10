import { getServerSession, type NextAuthOptions } from 'next-auth'
import TwitterProvider from 'next-auth/providers/twitter'
import CredentialsProvider from 'next-auth/providers/credentials'
import type { Session, DefaultSession } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import { PrivyClient } from '@privy-io/server-auth'

declare module 'next-auth' {
  interface Session {
    user: { id: string | null; walletAddress?: string | null } & DefaultSession['user']
    provider?: string
  }

  interface User {
    walletAddress?: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string
    walletAddress?: string | null
    provider?: string
  }
}

const hasPrivyConfig = Boolean(process.env.PRIVY_APP_ID && process.env.PRIVY_APP_SECRET)
const privyClient = hasPrivyConfig
  ? new PrivyClient(process.env.PRIVY_APP_ID as string, process.env.PRIVY_APP_SECRET as string)
  : null

const twitterProvider = TwitterProvider({
  clientId: process.env.TWITTER_CLIENT_ID ?? '',
  clientSecret: process.env.TWITTER_CLIENT_SECRET ?? '',
  version: '2.0'
})

const privyCredentialsProvider = CredentialsProvider({
  id: 'privy',
  name: 'Privy Wallet',
  credentials: {
    privyToken: { label: 'Privy Token', type: 'text' }
  },
  async authorize(credentials) {
    if (!privyClient) {
      throw new Error('Privy is not configured on the server.')
    }
    const token = credentials?.privyToken
    if (!token) return null

    const verified: any = await privyClient.verifyAuthToken(token).catch((error: unknown) => {
      console.error('Privy verification failed', error)
      return null
    })

    if (!verified?.user) {
      return null
    }

    const wallet: any =
      verified.user.wallets?.find((w: any) => w?.address) ??
      verified.user.linkedAccounts?.find?.((w: any) => w?.address) ??
      null

    const walletAddress: string | null = wallet?.address ?? null
    const userId: string =
      verified.user.id ??
      walletAddress ??
      `privy-user-${Date.now().toString(36)}`

    const displayName = walletAddress
      ? `Wallet ${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
      : 'Privy User'

    return {
      id: userId,
      name: displayName,
      email: null,
      image: null,
      walletAddress
    }
  }
})

export const authOptions: NextAuthOptions = {
  providers: hasPrivyConfig ? [twitterProvider, privyCredentialsProvider] : [twitterProvider],
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async jwt({ token, account, user }) {
      if (account?.provider === 'twitter') {
        token.provider = 'twitter'
        token.userId = account.providerAccountId ?? token.userId ?? token.sub ?? undefined
        token.name = user?.name ?? token.name
        token.picture = user?.image ?? token.picture
      }

      if (account?.provider === 'privy' || (!account && user?.walletAddress)) {
        token.provider = 'privy'
        token.userId = user?.id ?? token.userId
        token.walletAddress = user?.walletAddress ?? token.walletAddress ?? null
        token.name = user?.name ?? token.name
      }

      return token
    },
    async session({ session, token }) {
      session.user = session.user ?? { name: null, email: null, image: null } as Session['user']
      session.user.id = (token.userId ?? token.sub ?? null) as string | null
      if (token.walletAddress) {
        session.user.walletAddress = token.walletAddress
        session.user.name =
          session.user.name ??
          (token.walletAddress
            ? `Wallet ${token.walletAddress.slice(0, 6)}…${token.walletAddress.slice(-4)}`
            : session.user.name)
      }
      if (token.name && !session.user.name) {
        session.user.name = String(token.name)
      }
      if (token.picture && !session.user.image) {
        session.user.image = String(token.picture)
      }
      session.provider = token.provider ?? session.provider
      return session
    }
  },
  pages: {
    signIn: '/sign-in'
  }
}

export async function auth() {
  return getServerSession(authOptions)
}

export default auth
