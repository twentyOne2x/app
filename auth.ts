import { cookies } from 'next/headers'
import { getServerSession, type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import TwitterProvider from 'next-auth/providers/twitter'
import CredentialsProvider from 'next-auth/providers/credentials'
import type { Provider } from 'next-auth/providers'
import type { Session, DefaultSession } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import {
  E2E_USER_EMAIL,
  E2E_USER_ID,
  E2E_USER_NAME
} from '@/lib/sample-chats'

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
    provider?: string
    email?: string | null
  }
}

export const hasTwitterConfig = Boolean(
  process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET
)
export const hasGoogleConfig = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
)

export const IS_E2E_MODE =
  process.env.E2E_MODE === '1' || process.env.NEXT_PUBLIC_E2E_MODE === '1'
export const E2E_AUTH_COOKIE = 'e2e-auth-state'

const twitterProvider = hasTwitterConfig
  ? TwitterProvider({
      clientId: process.env.TWITTER_CLIENT_ID as string,
      clientSecret: process.env.TWITTER_CLIENT_SECRET as string,
      version: '2.0'
    })
  : null

const googleProvider = hasGoogleConfig
  ? GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string
    })
  : null

const localDevProvider = CredentialsProvider({
  id: 'local-dev',
  name: 'Local Dev',
  credentials: {},
  async authorize() {
    if (
      process.env.LOCAL_DEV_AUTH !== '1' &&
      process.env.E2E_MODE !== '1' &&
      process.env.NEXT_PUBLIC_E2E_MODE !== '1'
    ) {
      return null
    }
    return {
      id: E2E_USER_ID,
      name: E2E_USER_NAME,
      email: E2E_USER_EMAIL,
      image: null,
      walletAddress: null
    }
  }
})

const providers: Provider[] = []
if (twitterProvider) providers.push(twitterProvider)
if (googleProvider) providers.push(googleProvider)

if (providers.length === 0) {
  providers.push(localDevProvider)
}

export const authOptions: NextAuthOptions = {
  providers,
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async jwt({ token, account, user }) {
      if (
        account?.provider === 'twitter' ||
        account?.provider === 'google' ||
        (account?.provider === 'local-dev' &&
          process.env.ICMFYI_PRODUCTION !== '1' &&
          process.env.NODE_ENV !== 'production')
      ) {
        token.provider = account.provider
        token.userId = user?.id ?? account.providerAccountId ?? token.userId ?? token.sub ?? undefined
        token.email = user?.email ?? token.email ?? null
        token.name = user?.name ?? token.name
        token.picture = user?.image ?? token.picture
      }

      return token
    },
    async session({ session, token }) {
      session.user = session.user ?? { name: null, email: null, image: null } as Session['user']
      session.user.id = (token.userId ?? token.sub ?? null) as string | null
      if (token.name && !session.user.name) {
        session.user.name = String(token.name)
      }
      if (token.picture && !session.user.image) {
        session.user.image = String(token.picture)
      }
      if (token.email && !session.user.email) {
        session.user.email = String(token.email)
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
  if (IS_E2E_MODE) {
    const cookieStore = await cookies()
    const state = cookieStore.get(E2E_AUTH_COOKIE)?.value ?? 'active'
    if (state === 'signed-out') {
      return null
    }
    const session: Session = {
      user: {
        id: E2E_USER_ID,
        name: E2E_USER_NAME,
        email: E2E_USER_EMAIL,
        image: null
      },
      expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      provider: 'e2e'
    }
    return session
  }
  return getServerSession(authOptions)
}

export default auth
