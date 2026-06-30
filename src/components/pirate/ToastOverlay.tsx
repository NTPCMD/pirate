'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useGameStore } from '@/hooks/pirate/useGameStore';
import { useSound } from '@/components/pirate/SoundManager';
import { Coins, Flame, Shield, FlipHorizontal, Ship, Anchor, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToastPayload } from '@/lib/pirate/types';

const TONE_CLASS: Record<ToastPayload['tone'], string> = {
  neutral: 'border-border bg-card',
  good: 'border-emerald-500/50 bg-emerald-500/10',
  bad: 'border-destructive/50 bg-destructive/10',
  epic: 'border-gold/60 bg-gold/10',
  info: 'border-ocean/50 bg-ocean/10',
};

function fireConfetti() {
  const colors = ['#f5c542', '#f0a830', '#e67e22', '#1abc9c'];
  confetti({
    particleCount: 90,
    spread: 75,
    origin: { y: 0.6 },
    colors,
    scalar: 1.1,
  });
  setTimeout(() => {
    confetti({ particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors });
    confetti({ particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors });
  }, 180);
}

function EffectLayer({ animation }: { animation: ToastPayload['animation'] }) {
  if (!animation || animation === 'none') return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
      {animation === 'coins' && (
        <div className="absolute inset-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <Coins
              key={i}
              className="absolute h-4 w-4 text-gold animate-coin-fly"
              style={{
                left: `${10 + i * 10}%`,
                bottom: '0',
                animationDelay: `${i * 60}ms`,
              }}
            />
          ))}
        </div>
      )}
      {animation === 'fire' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Flame className="h-12 w-12 text-red-500 animate-flame" />
        </div>
      )}
      {animation === 'splash' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Ship className="h-12 w-12 text-cyan-400 animate-splash" />
        </div>
      )}
      {animation === 'anchor' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Anchor className="h-12 w-12 text-sky-400 animate-anchor-drop" />
        </div>
      )}
      {animation === 'shield' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Shield className="h-12 w-12 text-slate-300 animate-shield-pulse rounded-full" />
        </div>
      )}
      {animation === 'mirror' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <FlipHorizontal className="h-12 w-12 text-fuchsia-400 mirror-gleam relative" />
        </div>
      )}
      {animation === 'confetti' && <Sparkles className="absolute top-2 right-2 h-5 w-5 text-gold animate-float-slow" />}
    </div>
  );
}

export function ToastOverlay() {
  const toasts = useGameStore((s) => s.toasts);
  const dismiss = useGameStore((s) => s.dismissToast);
  const { play } = useSound();
  const playedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const t of toasts) {
      if (playedRef.current.has(t.id)) continue;
      playedRef.current.add(t.id);
      // sound mapping
      const map: Record<string, any> = {
        confetti: 'bigcash',
        coins: 'cash',
        fire: 'fire',
        splash: 'splash',
        anchor: 'anchor',
        shield: 'shield',
        mirror: 'mirror',
        none: 'click',
      };
      play(map[t.animation ?? 'none'] ?? 'click');
      if (t.animation === 'confetti') fireConfetti();
    }
    // cleanup old ids
    if (playedRef.current.size > 30) {
      const ids = new Set(toasts.map((t) => t.id));
      playedRef.current = new Set([...ids]);
    }
  }, [toasts, play]);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 w-[92vw] max-w-md pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className={cn(
              'pointer-events-auto relative w-full overflow-hidden rounded-xl border px-4 py-3 shadow-lg backdrop-blur-md',
              TONE_CLASS[t.tone],
              t.tone === 'bad' && 'animate-shake',
            )}
          >
            <EffectLayer animation={t.animation} />
            <div className="relative flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{t.title}</div>
                {t.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
