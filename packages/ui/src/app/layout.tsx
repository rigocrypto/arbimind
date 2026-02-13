export const dynamic = 'force-dynamic';
import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { Suspense } from 'react'
import './globals.css'
import { ClientProviders } from '@/providers/ClientProviders'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { MobileBottomBar } from '@/components/Layout/MobileBottomBar'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: 'ArbiMind - The Brain of On-Chain Arbitrage',
  description: 'Professional MEV/searcher system for detecting and executing arbitrage opportunities across multiple DEXes',
  keywords: ['arbitrage', 'mev', 'defi', 'ethereum', 'dex', 'trading'],
  authors: [{ name: 'ArbiMind Team' }],
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="animate-pulse text-dark-400 text-sm">Loading...</div>
    </div>
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${spaceGrotesk.variable}`}>
      <body className={`${inter.className} bg-dark-900 text-white min-h-screen w-full overflow-x-hidden flex flex-col`}>
        <Header />
        <main className="flex-1 flex flex-col min-h-0 pt-16 pb-16">
          <Suspense fallback={<LoadingFallback />}>
            <ClientProviders>
              {children}
            </ClientProviders>
          </Suspense>
        </main>
        <MobileBottomBar />
        <Footer />
      </body>
    </html>
  )
}
