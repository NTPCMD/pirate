'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore, REACTION_LIFETIME_MS } from '@/hooks/pirate/useGameStore';
import type { Reaction } from '@/lib/pirate/types';

/**
 * ReactionLayer
 * -------------
 * A fixed, full-viewport, pointer-events-none overlay that renders the active
 * ephemeral emoji reactions as floating chips. Each reaction:
 *   - appears at a random horizontal offset (within the central board area)
 *   - rises from near the bottom of the viewport to ~60% of the way up
 *   - fades out over REACTION_LIFETIME_MS (2.5s)
 *   - shows the emoji at text-2xl/3xl and the sender's name below in tiny text
 *
 * The overlay is rendered once at the root (page.tsx) so it is visible across
 * host, player, and spectator screens. Reactions from ALL roles are visible
 * to ALL roles because the server broadcasts them to the whole room.
 *
 * Animations use transform + opacity only (per spec) for GPU-friendly motion.
 */
export function ReactionLayer() {
  const reactions = useGameStore((s) => s.reactions);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
    >
      <AnimatePresence>
        {reactions.map((r) => (
          <FloatingReaction key={r.id} reaction={r} />
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * A single floating reaction chip. The horizontal position is randomized once
 * on mount (per-reaction) so that simultaneous reactions don't stack perfectly
 * on top of each other.
 */
function FloatingReaction({ reaction }: { reaction: Reaction }) {
  // Random horizontal position within the central 80% of the viewport (10%–90%).
  // Recomputed only on mount — `useMemo` with [] deps guarantees a stable
  // position for the lifetime of this reaction.
  const leftPct = useMemo(() => 10 + Math.random() * 80, []);
  // Randomised horizontal drift so each reaction sways slightly differently
  // as it rises (in px, applied via transform).
  const drift = useMemo(() => (Math.random() - 0.5) * 80, []);
  // Randomised rotation for a touch of pirate chaos (±8deg).
  const rotate = useMemo(() => (Math.random() - 0.5) * 16, []);
  // Randomised scale so a flurry of reactions feels organic, not robotic.
  const scale = useMemo(() => 0.9 + Math.random() * 0.35, []);

  // Drive the animation by the reaction's arrival timestamp so it stays in
  // sync even if React delays the paint by a frame. We compute the remaining
  // duration from REACTION_LIFETIME_MS — if a reaction arrives "stale" (e.g.
  // tab was backgrounded) we still animate it for the configured lifetime.
  const [duration] = useState(() => REACTION_LIFETIME_MS / 1000);
  // Capture the viewport height once on mount so the rise distance is stable
  // for the lifetime of the reaction (resizing the window mid-animation would
  // otherwise cause a jolt). Falls back to 400px if window is unavailable.
  const [riseDistance] = useState(
    () => (typeof window !== 'undefined' ? window.innerHeight : 800) * 0.55,
  );

  // Respect reduced-motion preferences: skip the float-up animation and just
  // fade in/out in place.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    // Outer wrapper: absolutely positioned at a random horizontal point,
    // centered on that point via translateX(-50%) in a className (not in the
    // animated style — that would conflict with framer-motion's `x` transform).
    <div
      className="absolute"
      style={{
        left: `${leftPct}%`,
        bottom: '8%',
        transform: 'translateX(-50%)',
      }}
    >
      <motion.div
        layout={false}
        initial={{
          // Start fully transparent, slightly below, slightly smaller.
          opacity: 0,
          y: 40,
          x: 0,
          scale: scale * 0.6,
          rotate: 0,
        }}
        animate={
          reduceMotion
            ? { opacity: [0, 1, 1, 0], y: 0, x: 0, scale, rotate: 0 }
            : {
                opacity: [0, 1, 1, 0],
                // Rise ~55% of the viewport height (captured once on mount so
                // resizing the window mid-animation doesn't cause a jolt).
                y: [40, -riseDistance],
                x: [0, drift],
                scale: [scale * 0.6, scale, scale, scale * 0.85],
                rotate: [0, rotate, rotate, rotate * 0.5],
              }
        }
        exit={{ opacity: 0, scale: scale * 0.5 }}
        transition={{
          duration,
          ease: 'easeOut',
          // Stagger the keyframes so the fade-in is quick, the float dominates,
          // and the fade-out happens at the very end.
          times: reduceMotion ? [0, 0.15, 0.85, 1] : [0, 0.12, 0.75, 1],
        }}
        style={{ willChange: 'transform, opacity' }}
        className="flex flex-col items-center gap-0.5 select-none"
      >
        <span
          className="text-3xl sm:text-4xl leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
          style={{ filter: 'saturate(1.1)' }}
        >
          {reaction.emoji}
        </span>
        <span className="text-[10px] sm:text-xs font-semibold text-foreground/90 bg-background/70 backdrop-blur-sm px-1.5 py-0.5 rounded-full border border-gold/30 shadow-sm max-w-[8rem] truncate">
          {reaction.playerName}
        </span>
      </motion.div>
    </div>
  );
}

export default ReactionLayer;
