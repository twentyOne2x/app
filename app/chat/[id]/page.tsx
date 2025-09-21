// app/chat/[id]/page.tsx
import { type Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { auth } from '@/auth'
import { getChat } from '@/app/actions'
import { Chat } from '@/components/chat'
import ShareChatHeader from '@/components/share-chat-header';

export const preferredRegion = 'home'

export interface ChatPageProps {
  params: {
    id: string
  }
}

export async function generateMetadata({
  params
}: ChatPageProps): Promise<Metadata> {
  const session = await auth()

  if (!session?.user || session.user.id === null) {
    // Return default metadata for anonymous users
    return {
      title: 'Chat'
    }
  }

  const chat = await getChat(params.id, session.user.id)
  return {
    title: chat?.title.toString().slice(0, 50) ?? 'Chat'
  }
}

export default async function ChatPage({ params }: ChatPageProps) {
  console.log('ChatPage: Start - Params:', params);

  const session = await auth();
  console.log('ChatPage: Session data:', session);

  const isAnonymous = !session?.user || session.user.id === null;
  
  // Ensure userId is always a string
  const userId: string = isAnonymous ? 'anonymous' : (session.user.id ?? 'anonymous');

  // For authenticated users, perform standard authentication checks
  if (!isAnonymous) {
    if (!userId) {
      // This should not happen since we handle anonymous sessions
      redirect(`/sign-in?next=/chat/${params.id}`);
      console.error('Authentication required.');
      return;
    }
  }

  const chat = await getChat(params.id, userId);
  console.log('ChatPage: Chat data:', chat);

  if (!chat) {
    console.error('Chat not found:', params.id);
    notFound();
    return;
  }

  if (chat.readOnly) {
    console.log('ChatPage: Chat is read-only, redirecting to sharePath');
    if (chat.sharePath) {
      console.log('ChatPage: Redirecting now to', chat.sharePath);
      redirect(chat.sharePath as string);
    } else {
      console.error('ReadOnly chat does not have a sharePath:', params.id);
      notFound();
    }
    return;
  }

  if (!isAnonymous && chat.userId && chat.userId !== userId) {
    console.error('Permission denied for chat:', params.id);
    notFound();
    return;
  }

  console.log('ChatPage: Rendering Chat and ShareChatHeader components');
  return (
    <>
      <Chat id={chat.id} initialMessages={chat.messages} structured_metadata={chat.structured_metadata} />
      {/* Only show ShareChatHeader if the user is authenticated */}
      {!isAnonymous && (
        <ShareChatHeader chatId={chat.id} userId={userId} chat={chat} />
      )}
    </>
  );
}
