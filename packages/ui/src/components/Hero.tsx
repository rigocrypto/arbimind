'use client';

import { motion } from 'framer-motion';
import { ArrowRight, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { float, fadeIn } from '@/lib/animations';

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-dark-900 via-purple-900/20 to-teal-900/20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(139,92,246,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(20,184,166,0.05)_50%,transparent_75%)] bg-[length:50px_50px]" />
      </div>

      {/* Floating 3D Orb */}
      <motion.div
        className="absolute top-20 right-20 w-64 h-64 rounded-full bg-gradient-to-br from-purple-500/30 via-teal-500/30 to-pink-500/30 blur-3xl"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />

      <motion.div
        className="absolute bottom-20 left-20 w-96 h-96 rounded-full bg-gradient-to-br from-teal-500/20 via-pink-500/20 to-purple-500/20 blur-3xl"
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial="initial"
          animate="animate"
          variants={fadeIn}
        >
          <motion.h1
            className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-purple-400 via-teal-400 to-pink-400 bg-clip-text text-transparent"
            variants={fadeIn}
          >
            ArbiMind
          </motion.h1>
          <motion.p
            className="text-xl md:text-2xl text-dark-300 mb-4"
            variants={fadeIn}
          >
            The AI Brain of Decentralized Arbitrage
          </motion.p>
          <motion.p
            className="text-lg md:text-xl text-dark-400 mb-12"
            variants={fadeIn}
          >
            Autonomous profit engine. Quantum-secure. Live on Ethereum.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
            variants={fadeIn}
          >
            <Link
              href="/dashboard"
              className="group relative px-8 py-4 bg-gradient-to-r from-purple-600 to-teal-600 rounded-lg font-semibold text-white hover:from-purple-500 hover:to-teal-500 transition-all duration-300 shadow-lg shadow-purple-500/50 hover:shadow-purple-500/70 flex items-center gap-2"
            >
              Launch Dashboard
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/docs"
              className="px-8 py-4 border-2 border-purple-500/50 rounded-lg font-semibold text-white hover:border-purple-400 hover:bg-purple-500/10 transition-all duration-300 flex items-center gap-2"
            >
              <BookOpen className="w-5 h-5" />
              Read Docs
            </Link>
          </motion.div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-10 left-1/2 transform -translate-x-1/2"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="w-6 h-10 border-2 border-purple-500/50 rounded-full flex items-start justify-center p-2">
          <motion.div
            className="w-1.5 h-1.5 bg-purple-400 rounded-full"
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
      </motion.div>
    </section>
  );
}

