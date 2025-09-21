import { type Metadata } from 'next'
import { notFound } from 'next/navigation'

import { formatDate } from '@/lib/utils'
import { getSharedChat } from '@/app/actions'
import { Chat } from '@/components/chat'
import { FooterText } from '@/components/footer'

export const preferredRegion = 'home'

interface SharePageProps {
  params: {
    id: string
  }
}

// TODO 2024-01-28: fix bug where, if the link is opened on mobile, then it prompts to log in. If then we open that same link to the web-browser from the messaging app,
//  then it does the same. However if we copy paste the link in the web browser directly, then it is 
//  Somehow the shared-view in the messaging-app works but only once logged in.
export async function generateMetadata({
  params
}: SharePageProps): Promise<Metadata> {
  const chat = await getSharedChat(params.id)

  return {
    title: chat?.title.slice(0, 50) ?? 'Chat'
  }
}

export default async function SharePage({ params }: SharePageProps) {
  const chat = await getSharedChat(params.id)

  if (!chat || !chat?.sharePath) {
    notFound()
  }

  // Get the role of the last message
  const lastMessageRole = chat.messages[chat.messages.length - 1]?.role;

  // TODO 2024-01-28: add functionality to continue the chat, moving the user into another window with the same chat content but new chat ID
  // TODO 2024-01-30: add bottom padding to metadata container
  return (
    <>
      <div className="flex-1 space-y-6 pb-12"> {/* Added bottom padding to the whole container */}
        <div className="px-4 py-6 border-b bg-background md:px-6 md:py-8">
          <div className="max-w-2xl mx-auto md:px-6">
            <div className="space-y-1 md:-mx-8">
              <h1 className="text-2xl font-bold">{chat.title}</h1>
              <div className="text-sm text-muted-foreground">
                {formatDate(chat.createdAt)} · {chat.messages.length} messages
              </div>
            </div>
          </div>
        </div>
        <Chat id={chat.id} initialMessages={chat.messages} structured_metadata={chat.structured_metadata} shared_chat={true} noPaddingTop={true} className="pb-12" /> {/* Applied bottom padding directly to Chat if needed */}
      </div>
      <FooterText className="py-12" />
    </>
  )
}
