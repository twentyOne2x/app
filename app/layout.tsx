// app/layout.tsx
import { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
import '@/app/globals.css'
import { fontSans } from '@/lib/fonts'
import { cn } from '@/lib/utils'
import { TailwindIndicator } from '@/components/tailwind-indicator'
import { Providers } from '@/components/providers'
import { Analytics } from '@vercel/analytics/react';

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
  icons: { icon: '/favicon.ico', shortcut: '/favicon-16x16.png', apple: '/apple-touch-icon.png' },
  openGraph: {
    type: 'website', locale: 'en_US',
    url: process.env.NEXTAUTH_URL || 'http://localhost:3000',
    title: 'icm.fyi ICM Research Chatbot', description: '',
    siteName: 'icm.fyi', images: [{ url: '/opengraph-image.png', width: 1200, height: 630, alt: 'icm.fyi ICM Research Chatbot' }]
  },
  twitter: { card: 'summary_large_image', site: '@impliedval', title: 'icm.fyi ICM Research Chatbot', description: '', images: ['/twitter-image.png'] }
}

function PreloadUiIcons() {
  return (
    <>
      {UI_ICONS.map((href) => (<link key={href} rel="preload" as="image" href={href} />))}
      <img src={ASSISTANT_AVATAR} alt="" width={1} height={1} loading="eager" fetchPriority="high" decoding="sync" aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
      <img src={USER_AVATAR} alt="" width={1} height={1} loading="eager" fetchPriority="high" decoding="sync" aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
    </>
  )
}

interface RootLayoutProps { children: React.ReactNode }

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <head><PreloadUiIcons /></head>
      <body className={cn('font-sans antialiased', fontSans.variable)}>
        <Toaster />
        <Providers attribute="class" defaultTheme="dark" enableSystem={false}>
          <div className="flex flex-col min-h-screen">
            <main className="flex flex-col flex-1 bg-muted/50">{children}</main>
          </div>
          <TailwindIndicator />
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
