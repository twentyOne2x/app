// auth.ts
import { Session, DefaultSession } from 'next-auth';
import { headers, cookies as getCookies } from 'next/headers';
import { nanoid } from 'nanoid';

declare module 'next-auth' {
  interface Session {
    user: {
      /** The user's id. */
      id: string | null; // Allow null for anonymous users
    } & DefaultSession['user'];
  }
}

// Simplified auth function that only handles anonymous users
export async function auth(): Promise<Session | null> {
  // Get the hostname from the request headers
  const headersList = headers();
  const host = headersList.get('host') || '';
  const isMevMainDomain = host === 'icm.fyi' || host === `icm.fyi:${process.env.PORT}` || host === 'localhost:3000';

  // Read 'anonymousId' from cookies
  const cookieStore = getCookies();
  const anonymousId = cookieStore.get('anonymousId')?.value;
  
  if (anonymousId) {
    // Return the session with the anonymousId
    return { 
      user: { 
        id: anonymousId, 
        name: 'Anonymous',
        email: null,
        image: null
      },
      expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year from now
    } as Session;
  } else {
    // Generate a new anonymousId as fallback
    const newAnonymousId = nanoid();
    console.warn('anonymousId cookie missing. Middleware should set it, using fallback.');
    return { 
      user: { 
        id: newAnonymousId, 
        name: 'Anonymous',
        email: null,
        image: null
      },
      expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    } as Session;
  }
}

// Export default as the auth function for compatibility
export default auth;