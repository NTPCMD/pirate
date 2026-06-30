'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  LogOut,
  Radio,
  Ship,
  Skull,
  Telescope,
  Users,
} from 'lucide-react';
import { useGameStore } from '@/hooks/pirate/useGameStore';
import { useSound } from '@/components/pirate/SoundManager';
import { StatusDot } from '@/components/pirate/common';
import { BoardEditor } from '@/components/pirate/BoardEditor';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Small UI atoms
// ---------------------------------------------------------------------------

function AnimatedDots() {
  return (
    <span className="inline-flex gap-1.5 mt-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-2.5 w-2.5 rounded-full bg-gold"
          animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.15, 0.8] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

function PlayerAvatar({
  name,
  isHost,
  tone = 'ocean',
}: {
  name: string;
  isHost?: boolean;
  tone?: 'ocean' | 'gold';
}) {
  return (
    <span
      className={cn(
        'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-bold text-xs',
        tone === 'gold'
          ? 'bg-gold/15 border-gold/40 text-gold'
          : 'bg-ocean/15 border-ocean/30 text-ocean',
      )}
    >
      {name.slice(0, 2).toUpperCase()}
      {isHost && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gold/20 border border-gold/50 text-gold">
          <Skull className="h-2.5 w-2.5" />
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PlayerLobby() {
  const playerState = useGameStore((s) => s.playerState);
  const reset = useGameStore((s) => s.reset);
  const { play } = useSound();
  const [leaving, setLeaving] = useState(false);

  const handleLeave = () => {
    play('click');
    setLeaving(true);
    reset();
  };

  // Still connecting — no playerState yet
  if (!playerState) {
    return (
      <section
        className="min-h-[calc(100vh-3rem)] w-full flex flex-col items-center justify-center px-4 py-10"
        aria-label="Connecting to game"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
            className="h-12 w-12 rounded-full border-2 border-gold/30 border-t-gold"
          />
          <div className="space-y-1">
            <p className="text-sm font-medium">Connecting to the harbor…</p>
            <p className="text-xs text-muted-foreground">Finding yer seat on the ship</p>
          </div>
        </motion.div>
      </section>
    );
  }

  const code = playerState.code;
  const me = playerState.me;
  const rivals = playerState.rivals ?? [];
  const totalPlayers = rivals.length + 1;

  const roster = [
    {
      id: me.id,
      name: me.name,
      connected: me.connected,
      isHost: me.isHost,
      isMe: true,
    },
    ...rivals.map((r) => ({
      id: r.id,
      name: r.name,
      connected: r.connected,
      isHost: r.isHost,
      isMe: false,
    })),
  ];

  return (
    <section
      className="min-h-[calc(100vh-3rem)] w-full px-4 py-6 sm:px-6 sm:py-8"
      aria-label="Player waiting room"
    >
      <div className="mx-auto max-w-2xl space-y-5 sm:space-y-6">
        {/* Hero — You're in! */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center space-y-3"
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.05 }}
            className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 border-2 border-emerald-500/40"
          >
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </motion.div>
          <div>
            <h1 className="font-display text-4xl sm:text-5xl gold-text leading-none">
              You&apos;re in, {me.name}!
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              Yer pirate has boarded the ship. Hang tight — the captain will set sail shortly.
            </p>
          </div>
        </motion.header>

        {/* Game code */}
        <motion.article
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="pirate-card p-4 sm:p-6"
        >
          <header className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              <Radio className="h-3.5 w-3.5 text-gold" />
              Game code
            </div>
            <Badge variant="outline" className="border-gold/40 text-gold bg-gold/10">
              {totalPlayers} {totalPlayers === 1 ? 'pirate' : 'pirates'}
            </Badge>
          </header>
          <div className="rounded-lg border-2 border-gold/40 bg-gold/10 px-4 py-4 text-center min-h-[64px] flex items-center justify-center">
            <span className="font-mono text-3xl sm:text-4xl font-bold tracking-[0.3em] gold-text">
              {code}
            </span>
          </div>
        </motion.article>

        {/* Board Setup — player customizes their board before the game starts */}
        <BoardEditor />

        {/* Waiting for Host */}
        <motion.article
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="pirate-card p-6 sm:p-8 text-center overflow-hidden relative"
        >
          {/* Telescope looking out (top-right) + gentle bobbing ship (center) */}
          <motion.div
            animate={{ rotate: [-3, 3, -3] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-3 right-3 text-ocean/30"
            aria-hidden
          >
            <Telescope className="h-7 w-7" />
          </motion.div>

          <motion.div
            animate={{ y: [0, -10, 0], rotate: [-4, 4, -4] }}
            transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
            className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-ocean/15 border border-ocean/40 mb-4 ship-sail"
          >
            <Ship className="h-10 w-10 text-ocean" />
          </motion.div>
          <h2 className="font-display text-2xl sm:text-3xl text-foreground leading-none">
            Waiting for Host
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Captain{' '}
            <span className="font-semibold text-foreground">{playerState.hostName}</span>{' '}
            is preparing the voyage.
          </p>
          <AnimatedDots />
        </motion.article>

        {/* Roster */}
        <motion.article
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="pirate-card p-4 sm:p-6"
        >
          <header className="flex items-center justify-between mb-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-ocean" />
              Crew in the Lobby
            </h2>
            <span className="text-xs text-muted-foreground">
              {totalPlayers} {totalPlayers === 1 ? 'player' : 'players'} in the lobby
            </span>
          </header>
          <ul
            className="max-h-72 overflow-y-auto scroll-thin pr-1 space-y-2"
            aria-label="Players in lobby"
          >
            <AnimatePresence initial={false}>
              {roster.map((p, i) => (
                <motion.li
                  key={p.id}
                  layout
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 26, delay: i * 0.03 }}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5 min-h-[52px]',
                    p.isMe
                      ? 'border-gold/50 bg-gold/10'
                      : 'border-border bg-card/60 hover:border-ocean/40 transition-colors',
                  )}
                >
                  <PlayerAvatar name={p.name} isHost={p.isHost} tone={p.isMe ? 'gold' : 'ocean'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="truncate font-medium text-sm">{p.name}</span>
                      {p.isHost && (
                        <Badge
                          variant="outline"
                          className="border-gold/40 text-gold bg-gold/10 text-[10px] px-1.5 py-0"
                        >
                          Host
                        </Badge>
                      )}
                      {p.isMe && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 text-emerald-500 bg-emerald-500/10 text-[10px] px-1.5 py-0"
                        >
                          You
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusDot connected={p.connected} />
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {p.connected ? 'Online' : 'Away'}
                    </span>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </motion.article>

        {/* Leave */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="flex justify-center pb-2"
        >
          <Button
            onClick={handleLeave}
            variant="ghost"
            disabled={leaving}
            className="h-11 px-6 text-destructive hover:bg-destructive/10 hover:text-destructive btn-pirate"
            aria-label="Leave the game"
          >
            <LogOut className="h-4 w-4" />
            Leave game
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
