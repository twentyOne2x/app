// auth.ts
import NextAuth, {
  NextAuthOptions,
  Session,
  DefaultSession,
  User,
  Account,
  Profile,
} from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { sha256 } from 'hash.js';
import { getServerSession } from 'next-auth/next';
import { headers, cookies as getCookies } from 'next/headers';
import { JWT } from 'next-auth/jwt';
import { nanoid } from 'nanoid';

// Define a custom type for GitHub profile
interface GitHubProfile extends Profile {
  id: string;
  avatar_url?: string;
  picture?: string;
}

if (!process.env.GITHUB_ID) {
  console.error(
    '[GITHUB_ID] GitHub client ID is not set. Please check your environment variables.'
  );
  process.exit(1);
}

if (!process.env.GOOGLE_ID) {
  console.error(
    '[GOOGLE_ID] Google client ID is not set. Please check your environment variables.'
  );
  process.exit(1);
}

if (!process.env.GITHUB_SECRET) {
  console.error(
    '[GITHUB_SECRET] GitHub client secret is not set. Please check your environment variables.'
  );
  process.exit(1);
}

if (!process.env.GOOGLE_SECRET) {
  console.error(
    '[GOOGLE_SECRET] Google client secret is not set. Please check your environment variables.'
  );
  process.exit(1);
}

declare module 'next-auth' {
  interface Session {
    user: {
      /** The user's id. */
      id: string | null; // Allow null for anonymous users
    } & DefaultSession['user'];
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_ID!,
      clientSecret: process.env.GOOGLE_SECRET!,
    }),
  ],
  callbacks: {
    jwt({
      token,
      user,
      account,
      profile,
    }: {
      token: JWT;
      user?: User;
      account?: Account | null;
      profile?: Profile;
    }) {
      if (account?.provider === 'google') {
        // Generate a consistent userId for Google users based on their email
        if (user?.email) {
          token.id = sha256().update(user.email).digest('hex');
        } else {
          console.warn('Google authenticated user without an email.');
        }
      } else if (account?.provider === 'github' && profile) {
        // Cast profile to GitHubProfile for GitHub-specific fields
        const githubProfile = profile as GitHubProfile;
        token.id = githubProfile.id;
        token.image = githubProfile.avatar_url || githubProfile.picture;
      }
      return token;
    },
    session({
      session,
      token,
    }: {
      session: Session;
      token: JWT;
    }) {
      if (token?.id) {
        session.user.id = token.id as string; // Cast token.id as string
      } else {
        session.user.id = null; // Set id to null for anonymous users
      }
      return session;
    },
  },
  pages: {
    signIn: '/sign-in', // Custom sign-in page
  },
};

// Initialize NextAuth
export default NextAuth(authOptions);

// Export GET and POST handlers
export const GET = (req: Request) => NextAuth(authOptions)(req);
export const POST = (req: Request) => NextAuth(authOptions)(req);

// Custom auth function
export async function auth() {
  const session = await getServerSession(authOptions);

  if (session) {
    return session;
  }

  // Get the hostname from the request headers
  const headersList = headers();
  const host = headersList.get('host') || '';

  const isMevMainDomain = host === 'mev.fyi' || host === `mev.fyi:${process.env.PORT}`;

  if (isMevMainDomain) {
    // Read 'anonymousId' from cookies
    const cookieStore = getCookies();
    const anonymousId = cookieStore.get('anonymousId')?.value;

    if (anonymousId) {
      // Return the session with the anonymousId
      return { user: { id: anonymousId, name: 'Anonymous' } };
    } else {
      // This should not happen since middleware sets the cookie
      // But as a fallback, generate a new anonymousId
      const newAnonymousId = nanoid();
      console.warn('anonymousId cookie missing for mev.fyi. Middleware should set it.');
      return { user: { id: newAnonymousId, name: 'Anonymous' } };
    }
  }

  // For other hosts (app.mev.fyi), enforce authentication
  return null;
}
