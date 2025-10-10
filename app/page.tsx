// app/page.tsx
import { Metadata } from 'next';
import { nanoid } from '@/lib/utils';
import { Chat } from '@/components/chat';
import ShareChatHeader from '@/components/share-chat-header';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Home - icm.fyi ICM Research Chatbot',
  description: 'Interact with the icm.fyi ICM chatbot to explore Internet Capital Markets (ICM) insights.',
  openGraph: {
    title: 'Home - icm.fyi ICM Research Chatbot',
    description: 'Interact with the icm.fyi ICM chatbot to explore Internet Capital Markets (ICM) insights.',
    url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/`,
    images: ['/opengraph-image.png'],
    siteName: 'icm.fyi',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Home - icm.fyi ICM Research Chatbot',
    description: 'Interact with the icm.fyi ICM chatbot to explore Internet Capital Markets (ICM) insights.',
    images: ['/twitter-image.png'],
  },
};

export default async function IndexPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/sign-in?callbackUrl=/')
  }
  const id = nanoid();
  return (
    <>
      <Chat id={id} />
      {session?.user?.id && <ShareChatHeader chatId={id} userId={session.user.id} />}
    </>
  );
}
