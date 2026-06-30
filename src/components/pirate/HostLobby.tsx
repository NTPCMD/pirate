'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import {
  Anchor,
  Activity as ActivityIcon,
  Bot as BotIcon,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Eye,
  Gem,
  Play,
  Radio,
  Ship,
  Skull,
  Timer,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useGameStore } from '@/hooks/pirate/useGameStore';
import { useSound } from '@/components/pirate/SoundManager';
import { StatusDot } from '@/components/pirate/common';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ActivityEvent } from '@/lib/pirate/types';

// ---------------------------------------------------------------------------
// Tone → tailwind classes for activity feed rows
// ---------------------------------------------------------------------------

type ActivityTone = NonNullable<ActivityEvent['tone']>;

const TONE_DOT_CLASS: Record<ActivityTone, string> = {
  good: 'bg-emerald-500',
  bad: 'bg-destructive',
  epic: 'bg-gold',
  info: 'bg-ocean',
  neutral: 'bg-muted-foreground/50',
};

const TONE_ROW_CLASS: Record<ActivityTone, string> = {
  good: 'border-emerald-500/30 bg-emerald-500/10',
  bad: 'border-destructive/30 bg-destructive/10',
  epic: 'border-gold/40 bg-gold/10',
  info: 'border-ocean/30 bg-ocean/10',
  neutral: 'border-border bg-muted/30',
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Triggers a re-render every `intervalMs` so relative timestamps stay fresh. */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ---------------------------------------------------------------------------
// Small UI atoms
// ---------------------------------------------------------------------------

function AnimatedDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex gap-0.5 ml-1 align-middle', className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-1 w-1 rounded-full bg-current"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

function PlayerAvatar({ name, isHost, isBot }: { name: string; isHost?: boolean; isBot?: boolean }) {
  return (
    <span
      className={cn(
        'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
        isBot
          ? 'bg-ocean/15 border-ocean/30 text-ocean'
          : 'bg-ocean/15 border-ocean/30 text-ocean',
      )}
    >
      {isBot ? (
        <BotIcon className="h-4 w-4" />
      ) : (
        name.slice(0, 2).toUpperCase()
      )}
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

export default function HostLobby() {
  const hostState = useGameStore((s) => s.hostState);
  const startGame = useGameStore((s) => s.startGame);
  const addBot = useGameStore((s) => s.addBot);
  const removeBot = useGameStore((s) => s.removeBot);
  const setTimerDuration = useGameStore((s) => s.setTimerDuration);
  const reset = useGameStore((s) => s.reset);
  const { play } = useSound();
  const [copied, setCopied] = useState(false);
  const now = useNow(30_000);

  const code = hostState?.code ?? '';
  const players = hostState?.players ?? [];
  const activity = hostState?.activity ?? [];
  const canStart = players.length >= 1;
  const botCount = players.filter((p) => p.isBot).length;
  const botsDisabled = botCount >= 8;
  const humanCount = players.length - botCount;
  const readyCount = players.filter((p) => !p.isBot && p.ready).length;
  const allHumansReady = humanCount > 0 && readyCount === humanCount;
  const timerDuration = hostState?.roundTimer?.duration ?? 0;

  // Pre-compute relative time strings so they refresh whenever `now` ticks.
  const playerRows = useMemo(
    () =>
      players.map((p) => ({
        ...p,
        joinedAgo: formatDistanceToNow(new Date(p.joinedAt), { addSuffix: true }),
      })),
    [players, now],
  );

  const activityRows = useMemo(
    () =>
      activity.slice(0, 8).map((ev) => ({
        ev,
        ago: formatDistanceToNow(new Date(ev.at), { addSuffix: true }),
      })),
    [activity, now],
  );

  const handleCopy = async () => {
    if (!code) return;
    play('click');
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be blocked — silent fail, the click sound still plays.
    }
  };

  const handleStart = () => {
    if (!canStart) return;
    play('click');
    startGame();
  };

  const handleCancel = () => {
    play('click');
    reset();
  };

  const handleAddBot = () => {
    play('click');
    addBot();
  };

  const handleRemoveBot = (id: string) => {
    play('click');
    removeBot(id);
  };

  const handleSetTimer = (value: string) => {
    play('click');
    setTimerDuration(parseInt(value, 10));
  };

  return (
    <section
      className="min-h-[calc(100vh-3rem)] w-full px-4 py-6 sm:px-6 sm:py-8"
      aria-label="Host waiting room"
    >
      <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center text-center gap-2"
        >
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            <Skull className="h-3.5 w-3.5 text-gold" />
            Host · Waiting Room
          </div>
          <h1 className="font-display text-4xl sm:text-5xl gold-text leading-none">
            Captain&apos;s Quarters
          </h1>
          <p className="text-sm text-muted-foreground max-w-md">
            Share the code below with yer crew. The voyage begins when ye press start.
          </p>
        </motion.header>

        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Left column: code + players */}
          <div className="space-y-4 sm:space-y-6">
            {/* Game code card */}
            <motion.article
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="pirate-card p-4 sm:p-6"
            >
              <header className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                  <Radio className="h-3.5 w-3.5 text-gold" />
                  Share this code
                </div>
                <Badge variant="outline" className="border-gold/40 text-gold bg-gold/10">
                  {players.length} {players.length === 1 ? 'pirate' : 'pirates'}
                </Badge>
              </header>

              {botCount > 0 && (
                <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Cpu className="h-3 w-3 text-ocean" />
                  {botCount} {botCount === 1 ? 'bot' : 'bots'} aboard · max 8
                </div>
              )}

              {(hostState?.spectatorCount ?? 0) > 0 && (
                <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Eye className="h-3 w-3 text-ocean" />
                  {hostState!.spectatorCount} {hostState!.spectatorCount === 1 ? 'spectator' : 'spectators'} watching
                </div>
              )}

              <motion.div
                className="animate-float-slow"
                animate={{
                  boxShadow: [
                    '0 0 0 0 color-mix(in oklch, var(--gold) 0%, transparent)',
                    '0 0 0 10px color-mix(in oklch, var(--gold) 16%, transparent)',
                    '0 0 0 0 color-mix(in oklch, var(--gold) 0%, transparent)',
                  ],
                }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
              >
                <div className="flex items-stretch gap-2">
                  <div className="flex-1 rounded-lg border-2 border-gold/50 bg-gold/10 px-4 py-5 flex items-center justify-center min-h-[72px]">
                    <span className="font-mono text-4xl sm:text-5xl font-bold tracking-[0.3em] gold-text">
                      {code || '------'}
                    </span>
                  </div>
                  <Button
                    onClick={handleCopy}
                    variant="outline"
                    aria-label="Copy game code to clipboard"
                    className={cn(
                      'btn-pirate btn-copy-ripple h-auto min-h-[72px] px-3 sm:px-4 border-gold/40 hover:bg-gold/10 hover:text-gold',
                      copied && 'btn-copy-rippling',
                    )}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {copied ? (
                        <motion.span
                          key="check"
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.5, opacity: 0 }}
                          className="flex items-center gap-1.5 text-emerald-500"
                        >
                          <Check className="h-4 w-4" />
                          <span className="text-xs hidden sm:inline">Copied</span>
                        </motion.span>
                      ) : (
                        <motion.span
                          key="copy"
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.5, opacity: 0 }}
                          className="flex items-center gap-1.5"
                        >
                          <Copy className="h-4 w-4" />
                          <span className="text-xs hidden sm:inline">Copy</span>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Button>
                </div>
              </motion.div>

              <p className="mt-3 text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Anchor className="h-3 w-3 text-ocean" />
                Players join from the main screen using this 6-character code.
              </p>
            </motion.article>

            {/* Players card */}
            <motion.article
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="pirate-card p-4 sm:p-6"
            >
              <header className="flex items-center justify-between mb-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4 text-ocean" />
                  Crew Aboard
                </h2>
                <span className="text-xs text-muted-foreground">
                  {players.length} {players.length === 1 ? 'player' : 'players'} joined
                </span>
              </header>

              {playerRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center parchment-scroll">
                  <motion.div
                    initial={{ opacity: 0.6, y: 0 }}
                    animate={{ opacity: [0.6, 1, 0.6], y: [0, -6, 0], rotate: [-2, 2, -2] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                    className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 border border-gold/40 mb-3 chest-bob"
                  >
                    <Gem className="h-7 w-7 text-gold" />
                  </motion.div>
                  <p className="text-sm font-medium">No pirates aboard yet</p>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                    Share the code above to summon yer crew
                    <AnimatedDots />
                  </p>
                </div>
              ) : (
                <ul
                  className="max-h-96 overflow-y-auto scroll-thin pr-1 space-y-2"
                  aria-label="Joined players"
                >
                  <AnimatePresence initial={false}>
                    {playerRows.map((p, i) => (
                      <motion.li
                        key={p.id}
                        layout
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 28, delay: i * 0.02 }}
                        className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-3 py-2.5 hover:border-gold/40 transition-colors min-h-[52px]"
                      >
                        <PlayerAvatar name={p.name} isHost={p.isHost} isBot={p.isBot} />
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
                            {p.isBot && (
                              <Badge
                                variant="outline"
                                className="border-ocean/40 text-ocean bg-ocean/10 text-[10px] px-1.5 py-0 gap-0.5"
                              >
                                <BotIcon className="h-2.5 w-2.5" />
                                BOT
                              </Badge>
                            )}
                            {!p.isBot && p.ready && (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/50 text-emerald-500 bg-emerald-500/10 text-[10px] px-1.5 py-0 gap-0.5"
                              >
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                READY
                              </Badge>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Joined {p.joinedAgo}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {p.isBot ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveBot(p.id)}
                              aria-label={`Remove bot ${p.name}`}
                              className="h-7 px-2 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span className="hidden sm:inline">Remove</span>
                            </Button>
                          ) : (
                            <>
                              <StatusDot connected={p.connected} />
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {p.connected ? 'Online' : 'Away'}
                              </span>
                            </>
                          )}
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </motion.article>
          </div>

          {/* Right column: activity + settings + actions */}
          <div className="space-y-4 sm:space-y-6">
            {/* Activity feed */}
            <motion.article
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="pirate-card p-4 sm:p-6"
            >
              <header className="flex items-center justify-between mb-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <ActivityIcon className="h-4 w-4 text-gold" />
                  Ship&apos;s Log
                </h2>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  live
                </span>
              </header>

              {activityRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
                  <p className="text-xs text-muted-foreground">
                    Quiet seas… waiting for the first sailor to come aboard.
                  </p>
                </div>
              ) : (
                <ul
                  className="max-h-72 overflow-y-auto scroll-thin pr-1 space-y-1.5"
                  aria-label="Recent activity"
                >
                  <AnimatePresence initial={false}>
                    {activityRows.map(({ ev, ago }) => (
                      <ActivityRow key={ev.id} ev={ev} ago={ago} />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </motion.article>

            {/* Game Settings — Round Timer */}
            <motion.article
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.22 }}
              className="pirate-card p-4 sm:p-6"
            >
              <header className="flex items-center justify-between mb-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Timer className="h-4 w-4 text-ocean" />
                  Game Settings
                </h2>
                {timerDuration > 0 && (
                  <Badge
                    variant="outline"
                    className="border-ocean/40 text-ocean bg-ocean/10 text-[10px] gap-0.5"
                  >
                    <Timer className="h-2.5 w-2.5" />
                    Auto · {timerDuration}s
                  </Badge>
                )}
              </header>

              <div className="space-y-2">
                <label
                  htmlFor="round-timer-select"
                  className="text-xs font-medium text-foreground"
                >
                  Auto-advance timer
                </label>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  When enabled, coordinates are called automatically every N
                  seconds. Keeps the game moving like a Kahoot round timer.
                </p>
                <Select
                  value={String(timerDuration)}
                  onValueChange={handleSetTimer}
                >
                  <SelectTrigger
                    id="round-timer-select"
                    className="w-full h-10 font-medium"
                    aria-label="Round timer duration"
                  >
                    <SelectValue placeholder="Off" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Off — manual calls only</SelectItem>
                    <SelectItem value="10">10 seconds (fast)</SelectItem>
                    <SelectItem value="15">15 seconds (brisk)</SelectItem>
                    <SelectItem value="20">20 seconds (standard)</SelectItem>
                    <SelectItem value="30">30 seconds (relaxed)</SelectItem>
                    <SelectItem value="45">45 seconds (leisurely)</SelectItem>
                    <SelectItem value="60">60 seconds (slow)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 pt-1">
                  <Clock className="h-3 w-3 text-gold/70" />
                  {timerDuration > 0
                    ? `Timer starts when the game begins. You can pause/resume it from the dashboard.`
                    : `Timer starts when the game begins. Pick a duration to enable.`}
                </p>
              </div>
            </motion.article>

            {/* Actions */}
            <motion.article
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
              className="pirate-card p-4 sm:p-6 space-y-3"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <motion.span
                  animate={{ rotate: [-3, 3, -3] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="inline-flex"
                >
                  <Ship className="h-3.5 w-3.5 text-ocean" />
                </motion.span>
                <span className="flex items-center">
                  Waiting for players to join<AnimatedDots />
                </span>
              </div>

              <Button
                onClick={handleStart}
                disabled={!canStart}
                size="lg"
                className="w-full h-12 text-base gap-2 bg-gold text-gold-foreground hover:bg-gold/90 disabled:opacity-60 btn-pirate"
              >
                <Play className="h-5 w-5" />
                Set Sail · Start Game
              </Button>

              {/* Ready status */}
              {humanCount > 0 && (
                <div
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs',
                    allHumansReady
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                      : 'border-gold/30 bg-gold/5 text-muted-foreground',
                  )}
                >
                  <CheckCircle2 className={cn('h-3.5 w-3.5', allHumansReady && 'animate-pulse')} />
                  <span className="tabular-nums">
                    {readyCount}/{humanCount} players ready
                  </span>
                  {allHumansReady && <span>· all set!</span>}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleAddBot}
                  disabled={botsDisabled}
                  variant="outline"
                  size="lg"
                  className="flex-1 h-11 gap-2 border-ocean/40 text-ocean hover:bg-ocean/10 hover:text-ocean disabled:opacity-50 btn-pirate"
                  aria-label="Add a bot player to the lobby"
                >
                  <Cpu className="h-4 w-4" />
                  Add Bot
                  <Badge variant="outline" className="ml-1 text-[10px] py-0 px-1.5 border-ocean/40 text-ocean">
                    {botCount}/8
                  </Badge>
                </Button>
              </div>

              {!canStart && (
                <p className="text-center text-xs text-muted-foreground">
                  Need at least 1 player to set sail · add a bot to play solo
                </p>
              )}

              {botsDisabled && (
                <p className="text-center text-xs text-muted-foreground">
                  Bot limit reached (8). Remove a bot to add another.
                </p>
              )}

              <Button
                onClick={handleCancel}
                variant="ghost"
                className="w-full h-11 text-destructive hover:bg-destructive/10 hover:text-destructive btn-pirate"
              >
                <X className="h-4 w-4" />
                Cancel &amp; disband game
              </Button>
            </motion.article>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Activity feed row
// ---------------------------------------------------------------------------

function ActivityRow({ ev, ago }: { ev: ActivityEvent; ago: string }) {
  const tone: ActivityTone = ev.tone ?? 'neutral';
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className={cn(
        'rounded-md border px-2.5 py-1.5 flex items-start gap-2 text-xs',
        TONE_ROW_CLASS[tone],
      )}
    >
      <span
        className={cn(
          'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
          TONE_DOT_CLASS[tone],
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="break-words leading-snug">{ev.message}</div>
        <div className="text-[10px] opacity-70 flex items-center gap-1 mt-0.5">
          <Clock className="h-2.5 w-2.5" />
          {ago}
        </div>
      </div>
    </motion.li>
  );
}
