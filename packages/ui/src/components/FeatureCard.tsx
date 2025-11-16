'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { scaleIn } from '@/lib/animations';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  delay?: number;
}

export function FeatureCard({ icon: Icon, title, description, delay = 0 }: FeatureCardProps) {
  return (
    <motion.div
      className="group relative p-8 rounded-xl bg-gradient-to-br from-dark-800/50 to-dark-900/50 border border-purple-500/20 backdrop-blur-sm hover:border-purple-500/40 transition-all duration-300"
      initial="initial"
      whileInView="animate"
      viewport={{ once: true }}
      variants={scaleIn}
      transition={{ delay }}
      whileHover={{ y: -5, scale: 1.02 }}
    >
      {/* Glow effect on hover */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500/0 via-purple-500/10 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl" />
      
      <div className="relative z-10">
        <div className="mb-4 p-3 rounded-lg bg-gradient-to-br from-purple-500/20 to-teal-500/20 w-fit">
          <Icon className="w-8 h-8 text-purple-400" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
        <p className="text-dark-400 leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}

