"use client";

import React from 'react';
import { motion, Variants, useReducedMotion, MotionProps } from 'framer-motion';

interface MotionWrapperProps extends Omit<MotionProps, 'children'> {
  children: React.ReactNode;
  variants?: Variants;
  initial?: string | false;
  animate?: string;
  exit?: string;
  className?: string;
}

const defaultVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.28 } },
};

export const MotionWrapper: React.FC<MotionWrapperProps> = ({
  children,
  variants = defaultVariants,
  initial = 'hidden',
  animate = 'enter',
  exit = 'exit',
  className,
  ...rest
}) => {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      initial={initial}
      animate={animate}
      exit={exit}
      variants={variants}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
};

export default MotionWrapper;
