'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { useGameStore } from '@/hooks/pirate/useGameStore';
import { useSound } from '@/components/pirate/SoundManager';
import { EMOTES } from '@/lib/pirate/types';
import { cn } from '@/lib/utils';

/**
 * EmoteBar
 * --------
 * A floating quick-reaction palette anchored to the bottom-right of the
 * viewport, just above the global footer. Renders the six pirate-themed emoji
 * from the `EMOTES` constant. Any role (host, player, spectator) can fire a
 * reaction.
 *
 * Behaviour:
 *   - On small screens the bar collapses into a single 😀-style toggle button
 *     to save space; tapping it expands the full 6-emoji row.
 *   - On larger screens it defaults to expanded.
 *   - On emoji tap: emits `player:react` via the store, plays a subtle click
 *     sound, briefly scales the button, and disables the whole bar for
 *     REACT_COOLDOWN_MS (500ms) — matching the server-side rate limit so the
 *     UI never lets the user queue a rejected reaction.
 *
 * Styling uses the pirate palette (gold + ocean accents) — no indigo/blue.
 */
const REACT_COOLDOWN_MS = 500;

export function EmoteBar() {
  const sendReaction = useGameStore((s) => s.sendReaction);
  const code = useGameStore((s) => s.code);
  const role = useGameStore((s) => s.role);
  const { play } = useSound();

  // Whether the palette is expanded. Defaults to collapsed on mobile,
  // expanded on sm+ screens. Hydrated after mount to avoid SSR mismatch.
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches) {
      setExpanded(true);
    }
  }, []);

  // Visual rate-limit: after sending a reaction, disable the whole bar for
  // REACT_COOLDOWN_MS so the user can't queue reactions the server will reject.
  const [cooldown, setCooldown] = useState(false);

  // Hide the bar entirely on the role-select / lobby screens — reactions only
  // make sense once you're in an active game session with a code.
  if (!code || role === 'none') return null;

  const handleReact = (emoji: string) => {
    if (cooldown) return;
    sendReaction(emoji);
    play('click');
    setCooldown(true);
    window.setTimeout(() => setCooldown(false), REACT_COOLDOWN_MS);
    // Collapse on mobile after sending so the bar doesn't block the board.
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 640px)').matches) {
      setExpanded(false);
    }
  };

  return (
    <div
      className={cn(
        'fixed z-50 right-3 sm:right-5',
        // Sit above the global footer (~3rem tall) with a little breathing room.
        'bottom-16 sm:bottom-20',
        // Let pointer events pass through the container itself except on the
        // actual buttons — so it never blocks board clicks in the empty space.
        'pointer-events-none',
      )}
    >
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        <AnimatePresence initial={false} mode="wait">
          {mounted && expanded ? (
            <motion.div
              key="palette"
              initial={{ opacity: 0, y: 8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.92 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="flex items-center gap-1 p-1.5 rounded-2xl border border-gold/40 bg-card/85 backdrop-blur-md shadow-lg shadow-black/20"
              role="group"
              aria-label="Quick reactions"
            >
              {EMOTES.map((e) => (
                <EmojiButton
                  key={e.emoji}
                  emoji={e.emoji}
                  label={e.label}
                  disabled={cooldown}
                  onClick={() => handleReact(e.emoji)}
                />
              ))}
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Collapse quick reactions"
                className="ml-0.5 flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="toggle"
              type="button"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setExpanded(true)}
              aria-label="Open quick reactions"
              aria-expanded={expanded}
              className={cn(
                'flex items-center gap-1.5 rounded-full border border-gold/50 bg-card/90 backdrop-blur-md px-3 py-2 shadow-lg shadow-black/25',
                'text-gold hover:bg-gold/10 transition-colors',
              )}
            >
              <Sparkles className="h-4 w-4" />
              <span className="text-lg leading-none" aria-hidden="true">
                😀
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * A single emoji button inside the palette. Scales briefly when tapped and
 * shows a small label tooltip on hover via the `title` attribute.
 */
function EmojiButton({
  emoji,
  label,
  disabled,
  onClick,
}: {
  emoji: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.82 }}
      whileHover={{ scale: 1.12 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={`Send ${label.toLowerCase()} emoji`}
      title={label}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-xl text-2xl leading-none',
        'border border-transparent hover:border-gold/40 hover:bg-gold/10',
        'transition-colors',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span aria-hidden="true">{emoji}</span>
    </motion.button>
  );
}

export default EmoteBar;
