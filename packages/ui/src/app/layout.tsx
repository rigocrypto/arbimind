import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ClientProviders } from '@/providers/ClientProviders'

const inter = Inter({ subsets: ['latin'] })

// Prevent SSG - WalletConnect uses indexedDB (browser-only) during prerender
export const dynamic = 'force-dynamic'

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-dark-900 text-white min-h-screen w-full overflow-x-hidden`}>
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  )
}
