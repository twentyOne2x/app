// app/page.tsx
import { Metadata } from 'next';
import { nanoid } from '@/lib/utils';
import { Chat } from '@/components/chat';
import ShareChatHeader from '@/components/share-chat-header';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers'; // Ensure headers is imported

export const metadata: Metadata = {
  title: 'Home - mev.fyi MEV Research Chatbot',
  description: 'Interact with the mev.fyi MEV research chatbot to explore Maximal Extractable Value (MEV) insights.',
  openGraph: {
    title: 'Home - mev.fyi MEV Research Chatbot',
    description: 'Interact with the mev.fyi MEV research chatbot to explore Maximal Extractable Value (MEV) insights.',
    url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/`,
    images: ['/opengraph-image.png'],
    siteName: 'mev.fyi',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Home - mev.fyi MEV Research Chatbot',
    description: 'Interact with the mev.fyi MEV research chatbot to explore Maximal Extractable Value (MEV) insights.',
    images: ['/twitter-image.png'],
  },
};

export default async function IndexPage() {
  const session = await auth();

  // Retrieve the host to determine the domain
  const headersList = headers();
  const host = headersList.get('host') || '';
  const isMevSubdomain = host.startsWith('app.mev.fyi');

  if (isMevSubdomain && !session?.user) {
    // Redirect to sign-in only if on app.mev.fyi and not authenticated
    redirect('/sign-in');
    console.error('Authentication required for app.mev.fyi.');
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
