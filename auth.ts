// auth.ts
import { Session, DefaultSession } from 'next-auth';
import { headers, cookies as getCookies } from 'next/headers';
import { nanoid } from 'nanoid';

declare module 'next-auth' {
  interface Session {
    user: { id: string | null } & DefaultSession['user'];
  }
}

export async function auth(): Promise<Session | null> {
  const cookieStore = getCookies();
  const anonymousId = cookieStore.get('anonymousId')?.value;
  if (anonymousId) {
    return {
      user: { id: anonymousId, name: 'Anonymous', email: null, image: null },
      expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    } as Session;
  }
  const newAnonymousId = nanoid();
  return {
    user: { id: newAnonymousId, name: 'Anonymous', email: null, image: null },
    expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  } as Session;
}

export default auth;
