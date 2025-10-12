// app/share/[id]/page.tsx
import { type Metadata } from 'next'
import { notFound } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { getSharedChat } from '@/app/actions'
import { Chat } from '@/components/chat'
import { FooterText } from '@/components/footer'
import { SourceListInline } from '@/components/source-list-inline'

export const preferredRegion = 'home'

interface SharePageProps { params: { id: string } }

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const chat = await getSharedChat(params.id)
  return { title: chat?.title.slice(0, 50) ?? 'Chat' }
}

// Minimal adapter: Message[] (from 'ai') -> MetadataMessage[] (Chat expects)
function adaptMessagesForChat(messages: any[] = []) {
  return messages.map((m) => {
    // Normalizes common shapes to { role, content, ...(optional fields) }
    const role = m.role ?? m.sender ?? 'assistant'
    const content =
      typeof m.content === 'string'
        ? m.content
        : typeof m.text === 'string'
        ? m.text
        : JSON.stringify(m.content ?? m)

    // Preserve optional IDs/metadata if Chat supports them; safe to include.
    const base: any = { role, content }
    if (m.id) base.id = m.id
    if (m.metadata) base.metadata = m.metadata
    return base
  })
}

export default async function SharePage({ params }: SharePageProps) {
  const chat = await getSharedChat(params.id)
  if (!chat || !chat?.sharePath) notFound()

  const initialMessages = adaptMessagesForChat(chat.messages)

  return (
    <>
      <div className="flex-1 space-y-6 pb-12">
        <div className="border-b bg-background px-4 py-6 md:px-6 md:py-8">
          <div className="mx-auto max-w-2xl md:px-6">
            <div className="space-y-1 md:-mx-8">
              <h1 className="text-2xl font-bold">{chat.title}</h1>
              <div className="text-sm text-muted-foreground">
                {formatDate(chat.createdAt)} · {chat.messages.length} messages
              </div>
            </div>
          </div>
        </div>

        <Chat
          id={chat.id}
          initialMessages={initialMessages as any}  // adapted to Chat's MetadataMessage[]
          structured_metadata={chat.structured_metadata}
          shared_chat={true}
          noPaddingTop={true}
          className="pb-12"
        />

        {/* Inline sources list */}
        <div className="px-4">
          <SourceListInline entries={chat.structured_metadata as any} className="mb-10 mt-2" />
        </div>
      </div>
      <FooterText className="py-12" />
    </>
  )
}
