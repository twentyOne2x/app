// app/page.tsx
import { Metadata } from 'next';
import { nanoid } from '@/lib/utils';
import { Chat } from '@/components/chat';
import ShareChatHeader from '@/components/share-chat-header';
import { auth } from '@/auth';
import { getServerChatAccessState } from '@/lib/chat-access';

export const metadata: Metadata = {
  title: 'icm.fyi ICM Research Chatbot',
  description: 'Interact with the icm.fyi ICM chatbot to explore Internet Capital Markets (ICM) insights.',
  openGraph: {
    title: 'icm.fyi ICM Research Chatbot',
    description: 'Interact with the icm.fyi ICM chatbot to explore Internet Capital Markets (ICM) insights.',
    url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/`,
    images: ['/opengraph-image.png'],
    siteName: 'icm.fyi',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'icm.fyi ICM Research Chatbot',
    description: 'Interact with the icm.fyi ICM chatbot to explore Internet Capital Markets (ICM) insights.',
    images: ['/twitter-image.png'],
  },
};

export default async function IndexPage() {
  const session = await auth();
  const id = nanoid();
  const accessState = await getServerChatAccessState(session?.user?.id ?? null)
  return (
    <>
      <Chat
        id={id}
        currentUser={session?.user ?? null}
        accessState={accessState}
        shareHeader={session?.user?.id ? <ShareChatHeader chatId={id} /> : null}
      />
    </>
  );
}
