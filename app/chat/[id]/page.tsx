// app/chat/[id]/page.tsx
import { type Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getChat } from '@/app/actions'
import { Chat } from '@/components/chat'
import ShareChatHeader from '@/components/share-chat-header'
import { SourceListInline } from '@/components/source-list-inline'
import { getServerChatAccessState } from '@/lib/chat-access'

export const preferredRegion = 'home'

export interface ChatPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({
  params
}: ChatPageProps): Promise<Metadata> {
  const [session, { id }] = await Promise.all([auth(), params])
  if (!session?.user || session.user.id === null) return { title: 'Chat' }
  const chat = await getChat(id, session.user.id)
  return { title: chat?.title.toString().slice(0, 50) ?? 'Chat' }
}

function adaptMessagesForChat(messages: any[] = []) {
  return messages.map(m => {
    const role = m.role ?? m.sender ?? 'assistant'
    const content =
      typeof m.content === 'string'
        ? m.content
        : typeof m.text === 'string'
          ? m.text
          : JSON.stringify(m.content ?? m)
    const base: any = { role, content }
    if (m.id) base.id = m.id
    if (m.metadata) base.metadata = m.metadata
    return base
  })
}

export default async function ChatPage({ params }: ChatPageProps) {
  const [session, { id }] = await Promise.all([auth(), params])
  if (!session) {
    redirect(`/sign-in?callbackUrl=/chat/${id}`)
  }
  const userId = session.user?.id ?? ''
  const accessState = await getServerChatAccessState(userId)

  const chat = await getChat(id, userId)
  if (!chat) return notFound()
  if (chat.readOnly) {
    if (chat.sharePath) return redirect(chat.sharePath as string)
    return notFound()
  }
  // getChat verifies the caller's raw session and resolves its canonical
  // PostgreSQL scope before returning a row; chat.userId is intentionally the
  // opaque canonical principal rather than the provider subject in session.
  if (!userId) return notFound()

  return (
    <>
      <Chat
        id={chat.id}
        initialMessages={adaptMessagesForChat(chat.messages) as any}
        structured_metadata={chat.structured_metadata}
        accessState={accessState}
        shareHeader={
          userId ? <ShareChatHeader chatId={chat.id} chat={chat} /> : null
        }
      />
      <div className="px-4 pb-16">
        <SourceListInline
          entries={chat.structured_metadata as any}
          className="mt-6"
        />
      </div>
    </>
  )
}
