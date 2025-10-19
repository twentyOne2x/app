// app/layout.tsx
import { Suspense } from 'react'
import { Metadata } from 'next'
import Image from 'next/image'
import { Toaster } from 'react-hot-toast'
import '@/app/globals.css'
import { fontSans } from '@/lib/fonts'
import { cn } from '@/lib/utils'
import { TailwindIndicator } from '@/components/tailwind-indicator'
import { Providers } from '@/components/providers'
import { Analytics } from '@vercel/analytics/react'
import { cookies } from 'next/headers'
import { ENTRY_PROFILE_COOKIE, getEntryProfileByCode } from '@/lib/entry-profiles'
import auth from '@/auth'
import { Header } from '@/components/header'
import { SidebarList } from '@/components/sidebar-list'

const UI_ICONS: string[] = [
  '/ui_icons/chatbot_1_32px.png',
  '/ui_icons/chatbot_1.svg',
  '/ui_icons/chatbot_2.svg',
  '/ui_icons/clear_the_chat_1_32px.png',
  '/ui_icons/clear_the_chat_1.svg',
  '/ui_icons/clear_the_chat_2.svg',
  '/ui_icons/refresh_reload_1_32px.png',
  '/ui_icons/refresh_reload_1_blue.svg',
  '/ui_icons/refresh_reload_1.svg',
  '/ui_icons/refresh_reload_2_blue.svg',
  '/ui_icons/refresh_reload_2.svg',
  '/ui_icons/send_chat_1.svg',
  '/ui_icons/send_chat_2_32px.png',
  '/ui_icons/send_chat_2.svg',
  '/ui_icons/send_chat_3.svg',
  '/ui_icons/share_chat_1_32px.png',
  '/ui_icons/share_chat_1.svg',
  '/ui_icons/share_chat_2.svg',
  '/ui_icons/user_1.svg',
  '/ui_icons/user_2_32px.png',
  '/ui_icons/user_2.svg',
]

const ASSISTANT_AVATAR = '/ui_icons/chatbot_1.svg'
const USER_AVATAR = '/ui_icons/user_1.svg'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  title: { default: 'icm.fyi ICM Research Chatbot', template: `%s - icm.fyi ICM Research Chatbot` },
  description: '',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' }
  ],
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.svg', sizes: 'any' }
    ]
  },
  openGraph: {
    type: 'website', locale: 'en_US',
    url: process.env.NEXTAUTH_URL || 'http://localhost:3000',
    title: 'icm.fyi ICM Research Chatbot', description: '',
    siteName: 'icm.fyi', images: [{ url: '/opengraph-image.png', width: 1200, height: 630, alt: 'icm.fyi ICM Research Chatbot' }]
  },
  twitter: { card: 'summary_large_image', site: '@impliedval', title: 'icm.fyi ICM Research Chatbot', description: '', images: ['/twitter-image.png'] }
}

function PreloadUiIconLinks() {
  return (
    <>
      {UI_ICONS.map((href) => (<link key={href} rel="preload" as="image" href={href} />))}
    </>
  )
}

function PreloadAvatarImages() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: 'none',
        overflow: 'hidden'
      }}
    >
      <Image
        src={ASSISTANT_AVATAR}
        alt=""
        width={1}
        height={1}
        priority
        style={{ width: 1, height: 1 }}
      />
      <Image
        src={USER_AVATAR}
        alt=""
        width={1}
        height={1}
        priority
        style={{ width: 1, height: 1 }}
      />
    </div>
  )
}

interface RootLayoutProps { children: React.ReactNode }

export default async function RootLayout({ children }: RootLayoutProps) {
  const cookieStore = cookies()
  const entryCode = cookieStore.get(ENTRY_PROFILE_COOKIE)?.value
  const entryProfile = getEntryProfileByCode(entryCode)
  const session = await auth()
  const userId = session?.user?.id ?? null

  return (
    <html lang="en">
      <head><PreloadUiIconLinks /></head>
      <body className={cn('font-sans antialiased', fontSans.variable)}>
        <PreloadAvatarImages />
        <Toaster />
        <Providers attribute="class" defaultTheme="dark" enableSystem={false} entryProfile={entryProfile}>
          <div className="flex min-h-screen flex-col bg-background">
            <Header session={session} />
            <div className="flex min-h-0 flex-1">
              {userId ? (
                <aside className="hidden w-80 shrink-0 border-r border-border/60 bg-background/60 md:flex md:min-h-0 md:flex-col">
                  <Suspense fallback={<div className="px-4 py-6 text-sm text-muted-foreground">Loading conversations…</div>}>
                    <SidebarList userId={userId} variant="desktop" />
                  </Suspense>
                </aside>
              ) : null}
              <main className="min-h-0 flex-1 overflow-y-auto bg-muted/40">{children}</main>
            </div>
          </div>
          <TailwindIndicator />
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
