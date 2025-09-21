// app/layout.tsx
import { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'

import '@/app/globals.css'
import { fontSans } from '@/lib/fonts'
import { cn } from '@/lib/utils'
import { TailwindIndicator } from '@/components/tailwind-indicator'
import { Providers } from '@/components/providers'
import { Header } from '@/components/header'
import { Analytics } from '@vercel/analytics/react';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  title: {
    default: 'mev.fyi MEV Research Chatbot',
    template: `%s - mev.fyi MEV Research Chatbot`
  },
  description: 'The Flashbots-grantee Maximal Extractable Value (MEV) research chatbot',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' }
  ],
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png'
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXTAUTH_URL || 'http://localhost:3000',
    title: 'mev.fyi MEV Research Chatbot',
    description: 'The Flashbots-grantee Maximal Extractable Value (MEV) research chatbot',
    siteName: 'mev.fyi',
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'mev.fyi MEV Research Chatbot'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    site: '@impliedval', // Replace with your Twitter handle
    title: 'mev.fyi MEV Research Chatbot',
    description: 'The Flashbots-grantee Maximal Extractable Value (MEV) research chatbot',
    images: ['/twitter-image.png'] // Ensure this image exists in public/
  }
}

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body
        className={cn(
          'font-sans antialiased',
          fontSans.variable,
        )}
      >
        <Toaster />
        <Providers attribute="class" defaultTheme="dark" enableSystem={false}>
          <div className="flex flex-col min-h-screen">
            {/* Uncomment if Header is needed */}
            {/* <Header /> */}
            <main className="flex flex-col flex-1 bg-muted/50">{children}</main>
          </div>
          <TailwindIndicator />
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
