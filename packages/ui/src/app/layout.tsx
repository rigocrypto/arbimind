import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import WalletProvider from '@/providers/wallet-provider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ArbiMind - The Brain of On-Chain Arbitrage',
  description: 'Professional MEV/searcher system for detecting and executing arbitrage opportunities across multiple DEXes',
  keywords: ['arbitrage', 'mev', 'defi', 'ethereum', 'dex', 'trading'],
  authors: [{ name: 'ArbiMind Team' }],
  viewport: 'width=device-width, initial-scale=1',
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
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  )
}
