export const dynamic = 'force-dynamic';
import type { Metadata, Viewport } from 'next'
import { DM_Sans, Inter, Space_Grotesk } from 'next/font/google'
import { Suspense } from 'react'
import './globals.css'
import { Providers } from '@/components/Providers'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { PromotionBanner } from '@/components/PromotionBanner'
import { MobileBottomBar } from '@/components/Layout/MobileBottomBar'
import ClientOnly from '@/components/ClientOnly';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-dm-sans' })

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
    <html lang="en" className={`dark ${inter.variable} ${spaceGrotesk.variable} ${dmSans.variable}`}>
      <body className={`${inter.className} bg-dark-900 text-white min-h-screen w-full overflow-x-hidden flex flex-col`}>
        {/* Global Video Background + Overlay */}
        <div className="fixed inset-0 w-full h-full z-[-2] pointer-events-none">
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover brightness-[0.35]"
            id="global-bg-video"
          >
            <source src="/background-image.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          <div className="absolute inset-0 bg-black/60" />
        </div>
            <ClientOnly>
              <Providers>
                <PromotionBanner />
                <div className="relative z-20">
                  <Header />
                </div>
                <main className="flex-1 flex flex-col min-h-0 pt-16 pb-16 relative z-10">
                  <Suspense fallback={<LoadingFallback />}>
                    {children}
                  </Suspense>
                </main>
                <MobileBottomBar />
                <Footer />
              </Providers>
            </ClientOnly>
      </body>
    </html>
  )
}
