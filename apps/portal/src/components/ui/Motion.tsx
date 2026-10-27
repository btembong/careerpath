'use client';
/**
 * Drop-in animated wrapper components.
 * These are the building blocks — compose them like regular divs.
 *
 * Usage:
 *   <FadeUp>  — fade + rise entrance
 *   <StaggerList> + <StaggerItem> — staggered list entrance
 *   <PageTransition> — wraps route content for smooth page changes
 *   <Presence> — shorthand AnimatePresence
 */

import {
  motion,
  AnimatePresence,
  type HTMLMotionProps,
} from 'framer-motion';
import {
  fadeUp,
  scaleFade,
  slideRight,
  slideLeft,
  slideUp,
  fade,
  stagger,
  staggerItem,
  hover,
  tap,
  spring,
} from '@/lib/motion';

// Re-export everything so consumers only need one import
export { motion, AnimatePresence, hover, tap, spring };
export { fadeUp, scaleFade, slideRight, slideLeft, slideUp, fade, stagger, staggerItem };

// ─── FadeUp ───────────────────────────────────────────────────────────────────
type DivProps = HTMLMotionProps<'div'>;

interface FadeUpProps extends DivProps {
  delay?: number;
}
export function FadeUp({ children, delay = 0, ...props }: FadeUpProps) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ ...spring.smooth, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─── ScaleFade ────────────────────────────────────────────────────────────────
interface ScaleFadeProps extends DivProps {
  delay?: number;
}
export function ScaleFade({ children, delay = 0, ...props }: ScaleFadeProps) {
  return (
    <motion.div
      variants={scaleFade}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ ...spring.smooth, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─── SlideUp ──────────────────────────────────────────────────────────────────
export function SlideUp({ children, ...props }: DivProps) {
  return (
    <motion.div
      variants={slideUp}
      initial="hidden"
      animate="visible"
      exit="exit"
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─── Fade ─────────────────────────────────────────────────────────────────────
export function Fade({ children, ...props }: DivProps) {
  return (
    <motion.div
      variants={fade}
      initial="hidden"
      animate="visible"
      exit="exit"
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─── StaggerList + StaggerItem ────────────────────────────────────────────────
export function StaggerList({ children, ...props }: DivProps) {
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      exit="exit"
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, ...props }: DivProps) {
  return (
    <motion.div variants={staggerItem} {...props}>
      {children}
    </motion.div>
  );
}

// ─── PageTransition ───────────────────────────────────────────────────────────
/** Wrap a route's root div with this for smooth page-level transitions. */
export function PageTransition({ children, ...props }: DivProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, transition: spring.smooth }}
      exit={{ opacity: 0, y: -6, transition: spring.fade }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─── Presence ────────────────────────────────────────────────────────────────
/** Shorthand AnimatePresence — exits are animated when children unmount. */
export function Presence({
  children,
  mode = 'wait',
}: {
  children: React.ReactNode;
  mode?: 'wait' | 'sync' | 'popLayout';
}) {
  return <AnimatePresence mode={mode}>{children}</AnimatePresence>;
}

// ─── AnimatedNumber ───────────────────────────────────────────────────────────
/** Counts up/down to a target number with spring physics. */
import { useEffect, useRef } from 'react';
import { useMotionValue, useTransform, animate } from 'framer-motion';

export function AnimatedNumber({
  value,
  duration = 0.8,
  format = (n: number) => n.toLocaleString(),
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const motionVal = useMotionValue(0);
  const displayRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const controls = animate(motionVal, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        if (displayRef.current) {
          displayRef.current.textContent = format(Math.round(v));
        }
      },
    });
    return controls.stop;
  }, [value]);

  return <span ref={displayRef}>{format(0)}</span>;
}

// ─── PressButton ─────────────────────────────────────────────────────────────
/** A <button> with built-in spring press physics. */
export function PressButton({
  children,
  className,
  onClick,
  disabled,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <motion.button
      whileHover={disabled ? {} : hover.glow}
      whileTap={disabled ? {} : tap.press}
      transition={spring.snappy}
      className={className}
      onClick={onClick}
      disabled={disabled}
      type={type}
      {...(props as HTMLMotionProps<'button'>)}
    >
      {children}
    </motion.button>
  );
}
