/**
 * Motion system for CareerPath Africa
 * Inspired by jakubkrehel's spring-physics-first approach.
 *
 * Philosophy:
 *  - Springs, not easing curves. Physics feel alive; bezier curves feel canned.
 *  - Micro-interactions should be instant (<150ms) and use stiff springs.
 *  - Page / section entrances use softer springs so content "settles" naturally.
 *  - Never animate layout properties directly — use transform + opacity only.
 *  - Stagger children so the eye has a path to follow.
 */

import { type Transition, type Variants } from 'framer-motion';

// ─── Spring Presets ────────────────────────────────────────────────────────────
// Named after how they feel, not their numbers.

export const spring = {
  /** Immediate, tight. Button press, checkbox tick, toggle flip. */
  snappy: { type: 'spring', stiffness: 500, damping: 35 } satisfies Transition,

  /** Crisp but not jarring. Card hover, dropdown open, nav highlight. */
  crisp: { type: 'spring', stiffness: 350, damping: 28 } satisfies Transition,

  /** Smooth settle. Page section entrance, modal appear, drawer slide. */
  smooth: { type: 'spring', stiffness: 240, damping: 26 } satisfies Transition,

  /** Soft landing. Hero content, onboarding steps, large panels. */
  gentle: { type: 'spring', stiffness: 160, damping: 22 } satisfies Transition,

  /** One tiny bounce. Success state, badge pop, confetti trigger. */
  bouncy: { type: 'spring', stiffness: 380, damping: 18 } satisfies Transition,

  /** No spring — use for opacity-only fades where spring is meaningless. */
  fade: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } satisfies Transition,

  /** Slow, cinematic fade. Hero overlays, full-page transitions. */
  cinematic: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } satisfies Transition,
} as const;

// ─── Stagger Helpers ──────────────────────────────────────────────────────────

/** Wraps children in a staggered container. Use with `staggerItem` on children. */
export function staggerContainer(
  staggerChildren = 0.06,
  delayChildren = 0,
): Transition {
  return { staggerChildren, delayChildren };
}

// ─── Variant Sets ─────────────────────────────────────────────────────────────
// Ready-made initial/animate/exit trios. Pass directly to <motion.X variants={}>.

/** Fade + slight rise. Universal entrance. Works on any element. */
export const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0,  transition: spring.smooth },
  exit:    { opacity: 0, y: -8, transition: spring.fade },
};

/** Fade + scale pop. Cards, badges, modals. */
export const scaleFade: Variants = {
  hidden:  { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1,    transition: spring.smooth },
  exit:    { opacity: 0, scale: 0.96, transition: spring.fade },
};

/** Slide in from right. Route transitions, wizard steps forward. */
export const slideRight: Variants = {
  hidden:  { opacity: 0, x: 40 },
  visible: { opacity: 1, x: 0,   transition: spring.smooth },
  exit:    { opacity: 0, x: -30, transition: spring.fade },
};

/** Slide in from left. Wizard steps backward. */
export const slideLeft: Variants = {
  hidden:  { opacity: 0, x: -40 },
  visible: { opacity: 1, x: 0,   transition: spring.smooth },
  exit:    { opacity: 0, x: 30,  transition: spring.fade },
};

/** Slide up from bottom. Mobile drawers, bottom sheets, toasts. */
export const slideUp: Variants = {
  hidden:  { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0,   transition: spring.smooth },
  exit:    { opacity: 0, y: 32,  transition: spring.fade },
};

/** Pure fade. Overlays, skeletons, subtle content swaps. */
export const fade: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: spring.fade },
  exit:    { opacity: 0, transition: spring.fade },
};

/** Stagger wrapper — children need their own variants. */
export const stagger: Variants = {
  hidden:  {},
  visible: { transition: staggerContainer(0.06, 0.05) },
  exit:    {},
};

/** Individual stagger child — pair with `stagger` parent. */
export const staggerItem: Variants = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0,  transition: spring.smooth },
  exit:    { opacity: 0, y: -6, transition: spring.fade },
};

// ─── Interaction Helpers ──────────────────────────────────────────────────────
// Use these on `whileHover` / `whileTap` / `whileFocus` props.

export const hover = {
  /** Subtle lift for cards. */
  lift:   { y: -3, scale: 1.01, transition: spring.crisp },
  /** Glow/scale for buttons. */
  glow:   { scale: 1.03,        transition: spring.snappy },
  /** Scale-up for icon buttons. */
  icon:   { scale: 1.12,        transition: spring.snappy },
  /** Highlight only — no movement. */
  none:   {},
} as const;

export const tap = {
  /** Standard press down. */
  press:  { scale: 0.96, transition: spring.snappy },
  /** Hard press for CTA buttons. */
  hard:   { scale: 0.93, transition: spring.snappy },
  /** Minimal. Icon buttons that shouldn't scale much. */
  soft:   { scale: 0.98, transition: spring.snappy },
} as const;
