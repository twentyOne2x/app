// app/page.tsx
import { Metadata } from 'next';
import { nanoid } from '@/lib/utils';
import { Chat } from '@/components/chat';
import ShareChatHeader from '@/components/share-chat-header';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers'; // Ensure headers is imported

export const metadata: Metadata = {
  title: 'Home - icm.fyi ICM Research Chatbot',
  description: 'Interact with the icm.fyi ICM research chatbot to explore Internet Capital Markets (ICM) insights.',
  openGraph: {
    title: 'Home - icm.fyi ICM Research Chatbot',
    description: 'Interact with the icm.fyi ICM research chatbot to explore Internet Capital Markets (ICM) insights.',
    url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/`,
    images: ['/opengraph-image.png'],
    siteName: 'icm.fyi',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Home - icm.fyi ICM Research Chatbot',
    description: 'Interact with the icm.fyi ICM research chatbot to explore Internet Capital Markets (ICM) insights.',
    images: ['/twitter-image.png'],
  },
};

export default async function IndexPage() {
  const session = await auth();

  // Retrieve the host to determine the domain
  const headersList = headers();
  const host = headersList.get('host') || '';
  const isMevSubdomain = host.startsWith('app.icm.fyi');

  if (isMevSubdomain && !session?.user) {
    // Redirect to sign-in only if on app.icm.fyi and not authenticated
    redirect('/sign-in');
    console.error('Authentication required for app.icm.fyi.');
    return;
  }

  const id = nanoid();

  return (
    <>
      <Chat id={id} />
      {/* Always render ShareChatHeader if userId is present */}
      {session?.user?.id && (
        <ShareChatHeader chatId={id} userId={session.user.id} />
      )}
    </>
  );
}
