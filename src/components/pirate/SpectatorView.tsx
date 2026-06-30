'use client';

// ============================================================================
// SpectatorView — read-only real-time overview of the game.
// Spectators see the leaderboard, revealed squares on every player's board,
// the activity feed, the current called coordinate, and the spectator list.
// They have NO board, NO money, NO powers, and NO host controls. Purely
// observational. Hidden square contents are scrubbed SERVER-SIDE before this
// snapshot is ever sent (see engine.ts → scrubPlayerForSpectator).
// ============================================================================

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  Trophy,
  Crown,
  Medal,
  Activity as ActivityIcon,
  Info,
  Crosshair,
  Coins,
  Sparkles,
  Shield,
  UserPlus,
  UserMinus,
  Settings,
  LogOut,
  MapPin,
  Timer,
  Bot as BotIcon,
  type LucideIcon,
} from 'lucide-react';

import { useGameStore } from '@/hooks/pirate/useGameStore';
import {
  GameBoard,
  PowerIcon,
  powerChipClass,
  StatusDot,
} from '@/components/pirate/common';
import { EmoteBar } from '@/components/pirate/EmoteBar';

import {
  formatMoney,
  type ActivityEvent,
  type GameStatus,
  type Player,
  type SpectatorGameState,
} from '@/lib/pirate/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Static lookups
// ---------------------------------------------------------------------------

const STATUS_BADGE_CLASS: Record<GameStatus, string> = {
  lobby: 'bg-secondary/80 text-secondary-foreground border-border',
  playing: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40',
  ended: 'bg-destructive/15 text-destructive border-destructive/40',
};

const STATUS_LABEL: Record<GameStatus, string> = {
  lobby: 'Lobby',
  playing: 'Live',
  paused: 'Paused',
  ended: 'Ended',
};

type Tone = NonNullable<ActivityEvent['tone']>;

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  good: 'text-emerald-500',
  bad: 'text-destructive',
  epic: 'text-gold',
  info: 'text-ocean',
};

const TONE_BG: Record<Tone, string> = {
  neutral: 'bg-muted/40 border-border',
  good: 'bg-emerald-500/10 border-emerald-500/30',
  bad: 'bg-destructive/10 border-destructive/30',
  epic: 'bg-gold/10 border-gold/40',
  info: 'bg-ocean/10 border-ocean/30',
};

const ACTIVITY_ICON: Record<ActivityEvent['type'], LucideIcon> = {
  'coordinate-called': Crosshair,
  'square-revealed': Coins,
  'power-used': Sparkles,
  'defense-used': Shield,
  'player-joined': UserPlus,
  'player-left': UserMinus,
  'player-reconnected': UserPlus,
  'host-action': Settings,
  system: Info,
};

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
}

function playerFinalScore(p: Player): number {
  return p.runningTotal + p.bankedTotal;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default function SpectatorView() {
  const specState = useGameStore((s) => s.spectatorState);
  const code = useGameStore((s) => s.code);

  if (!specState) {
    return (
      <div className="min-h-[calc(100vh-3rem)] flex items-center justify-center p-8">
        <div className="pirate-card p-6 text-center">
          <Eye className="h-10 w-10 text-ocean mx-auto mb-3 animate-float-slow" />
          <div className="display-font text-2xl text-gold mb-2">Climbing the mast…</div>
          <div className="text-sm text-muted-foreground">
            {code ? `Joining game ${code} as a spectator` : 'Establishing spectator session'}
          </div>
        </div>
      </div>
    );
  }

  return <SpectatorInner state={specState} />;
}

function SpectatorInner({ state }: { state: SpectatorGameState }) {
  return (
    <div className="min-h-[calc(100vh-3rem)] flex flex-col">
      <SpectatorTopBar state={state} />

      <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6">
        {/* Mobile tabs */}
        <Tabs defaultValue="leaderboard" className="lg:hidden">
          <TabsList className="w-full">
            <TabsTrigger value="leaderboard" className="flex-1 gap-1">
              <Trophy className="h-3.5 w-3.5" /> Board
            </TabsTrigger>
            <TabsTrigger value="boards" className="flex-1 gap-1">
              <Eye className="h-3.5 w-3.5" /> Boards
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex-1 gap-1">
              <ActivityIcon className="h-3.5 w-3.5" /> Feed
            </TabsTrigger>
          </TabsList>
          <TabsContent value="leaderboard" className="space-y-4 mt-4">
            <LeaderboardPanel state={state} />
          </TabsContent>
          <TabsContent value="boards" className="space-y-4 mt-4">
            <BoardsOverviewPanel state={state} />
          </TabsContent>
          <TabsContent value="activity" className="space-y-4 mt-4">
            <ActivityFeedPanel state={state} />
            <SpectatorListPanel state={state} />
          </TabsContent>
        </Tabs>

        {/* Desktop grid */}
        <div className="hidden lg:grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <LeaderboardPanel state={state} />
            <BoardsOverviewPanel state={state} />
          </div>
          <div className="lg:col-span-1 space-y-6">
            <ActivityFeedPanel state={state} />
            <SpectatorListPanel state={state} />
          </div>
        </div>
      </div>

      {/* Quick reactions — spectators can cheer/jeer along with the game. */}
      <EmoteBar />
      </div>
  );
}

// ---------------------------------------------------------------------------
// Top bar (sticky) — read-only: code, SPECTATOR badge, status, current coord
// ---------------------------------------------------------------------------

function SpectatorTopBar({ state }: { state: SpectatorGameState }) {
  const connected = useGameStore((s) => s.connected);
  const reset = useGameStore((s) => s.reset);
  const pushToast = useGameStore((s) => s.pushToast);

  const status = state.status;
  const currentCoord = state.currentCoord;
  const spectatorCount = state.spectators.length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(state.code);
      pushToast({ title: 'Code copied', description: state.code, tone: 'good' });
    } catch {
      pushToast({ title: 'Copy failed', tone: 'bad' });
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Game code */}
        <button
          type="button"
          onClick={handleCopy}
          className="font-mono text-base px-2.5 py-1 rounded-md border border-gold/40 text-gold bg-gold/5 hover:bg-gold/10 transition-colors"
          aria-label={`Game code ${state.code} — click to copy`}
        >
          {state.code}
        </button>

        {/* SPECTATOR badge */}
        <Badge
          variant="outline"
          className="border-ocean/40 text-ocean bg-ocean/10 gap-1"
        >
          <Eye className="h-3 w-3" /> SPECTATOR
        </Badge>

        {/* Status badge */}
        <Badge
          variant="outline"
          className={cn('uppercase tracking-wide text-xs', STATUS_BADGE_CLASS[status])}
        >
          {STATUS_LABEL[status]}
        </Badge>

        {/* Connection indicator */}
        <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <StatusDot connected={connected} />
          {connected ? 'connected' : 'reconnecting'}
        </span>

        {/* Current coordinate — gold, prominent */}
        <div className="flex items-center gap-1.5 ml-1 sm:ml-2">
          <MapPin className="h-4 w-4 text-gold pin-bounce" />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground hidden sm:inline">
            Now
          </span>
          <span
            className={cn(
              'text-2xl sm:text-3xl font-bold text-gold display-font tabular-nums min-w-[2.5rem] text-center',
              currentCoord && 'coord-dramatic',
            )}
            aria-live="polite"
          >
            {currentCoord ?? '—'}
          </span>
        </div>

        {/* Round timer — only if the round-timer feature is present */}
        {state.roundTimer && state.roundTimer.active && (
          <div className="flex items-center gap-1.5 ml-1">
            <Timer className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-mono font-bold tabular-nums text-amber-500">
              {Math.max(0, Math.ceil(state.roundTimer.remaining / 1000))}s
            </span>
          </div>
        )}

        {/* Watcher count + leave */}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Tooltip label={`${spectatorCount} ${spectatorCount === 1 ? 'spectator' : 'spectators'} watching`}>
            <Badge variant="outline" className="gap-1 text-xs">
              <Eye className="h-3 w-3" /> {spectatorCount}
            </Badge>
          </Tooltip>
          <Button
            size="sm"
            variant="ghost"
            className="btn-pirate"
            onClick={() => reset()}
            aria-label="Leave spectator session"
          >
            <LogOut className="h-4 w-4" /> Leave
          </Button>
        </div>
      </div>
    </header>
  );
}

/** Tiny tooltip wrapper — title attribute fallback (no Radix dependency here). */
function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span title={label} className="inline-flex">
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard — sorted by final score, top 3 highlighted, animated reorder
// ---------------------------------------------------------------------------

function LeaderboardPanel({ state }: { state: SpectatorGameState }) {
  const sorted = useMemo(
    () => [...state.players].sort((a, b) => playerFinalScore(b) - playerFinalScore(a)),
    [state.players],
  );

  return (
    <Card className="pirate-card p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="h-5 w-5 text-gold" />
        <h2 className="display-font text-xl text-gold">Live Leaderboard</h2>
        <Badge variant="outline" className="ml-auto text-xs">
          {sorted.length} {sorted.length === 1 ? 'player' : 'players'}
        </Badge>
      </div>

      {sorted.length === 0 ? (
        <div className="text-sm text-muted-foreground italic py-4">
          No players yet. Waiting for the crew to assemble…
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {sorted.map((p, idx) => {
              const rank = idx + 1;
              const final = playerFinalScore(p);
              const revealedCount = p.board.filter((s) => s.revealed).length;
              return (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  className={cn(
                    'rounded-lg border p-3 flex items-center gap-3 min-h-[44px]',
                    rank === 1 && 'border-gold/60 bg-gold/10',
                    rank === 2 && 'border-zinc-400/40 bg-zinc-400/10',
                    rank === 3 && 'border-orange-700/40 bg-orange-700/10',
                    rank > 3 && 'border-border bg-card/60',
                    !p.connected && 'opacity-70',
                  )}
                  aria-label={`Rank ${rank}: ${p.name}, ${formatMoney(final)}`}
                >
                  <div className="flex-shrink-0 w-7 text-center">
                    {rank === 1 ? (
                      <Crown className="h-6 w-6 mx-auto crown-glow" />
                    ) : rank === 2 ? (
                      <Medal className="h-5 w-5 mx-auto medal-silver" />
                    ) : rank === 3 ? (
                      <Medal className="h-5 w-5 mx-auto medal-bronze" />
                    ) : (
                      <span className="font-mono text-sm text-muted-foreground">{rank}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <StatusDot connected={p.connected} />
                      <span className="font-medium truncate">{p.name}</span>
                      {p.isHost && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1 border-gold/40 text-gold">
                          HOST
                        </Badge>
                      )}
                      {p.isBot && (
                        <Badge
                          variant="outline"
                          className="text-[10px] py-0 px-1 border-ocean/40 text-ocean bg-ocean/10 gap-0.5"
                        >
                          <BotIcon className="h-2.5 w-2.5" /> BOT
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {p.inventory.length} {p.inventory.length === 1 ? 'item' : 'items'} ·{' '}
                      {revealedCount}/100 revealed
                    </div>
                  </div>
                  {/* Inventory power icons */}
                  <div className="hidden sm:flex items-center gap-1 max-w-[120px] flex-wrap justify-end">
                    {p.inventory.slice(0, 5).map((it, i) => (
                      <div
                        key={`${it.type}-${i}`}
                        className={cn('rounded-md border px-1 py-0.5', powerChipClass(it.type))}
                      >
                        <PowerIcon power={it.type} className="h-3 w-3" />
                      </div>
                    ))}
                    {p.inventory.length > 5 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{p.inventory.length - 5}
                      </span>
                    )}
                  </div>
                  {/* Money */}
                  <div className="flex-shrink-0 text-right">
                    <div className="font-mono font-bold tabular-nums gold-text-strong">
                      {formatMoney(final)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatMoney(p.runningTotal)} run · {formatMoney(p.bankedTotal)} bank
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Player boards overview — compact grid of mini boards (revealed squares only)
// ---------------------------------------------------------------------------

function BoardsOverviewPanel({ state }: { state: SpectatorGameState }) {
  const sorted = useMemo(
    () => [...state.players].sort((a, b) => playerFinalScore(b) - playerFinalScore(a)),
    [state.players],
  );

  if (state.status === 'lobby') {
    return (
      <Card className="pirate-card p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="h-5 w-5 text-ocean" />
          <h2 className="display-font text-xl text-gold">Player Boards</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Eye className="h-10 w-10 text-muted-foreground/60 mb-3 animate-float-slow" />
          <p className="text-sm text-muted-foreground max-w-sm">
            Waiting for the host to start the game. Boards will appear here once
            the hunt begins.
          </p>
        </div>
      </Card>
    );
  }

  if (sorted.length === 0) {
    return null;
  }

  return (
    <Card className="pirate-card p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="h-5 w-5 text-ocean" />
        <h2 className="display-font text-xl text-gold">Player Boards</h2>
        <Badge variant="outline" className="ml-auto text-xs">
          revealed squares only
        </Badge>
      </div>

      {/* Mobile: horizontal scroll. Desktop: responsive grid. */}
      <div className="flex lg:grid lg:grid-cols-2 xl:grid-cols-3 gap-3 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 scroll-thin snap-x">
        {sorted.map((p) => {
          const final = playerFinalScore(p);
          const revealedCount = p.board.filter((s) => s.revealed).length;
          return (
            <div
              key={p.id}
              className="min-w-[260px] lg:min-w-0 snap-start rounded-lg border border-border bg-card/60 p-3"
            >
              {/* Player header */}
              <div className="flex items-center gap-2 mb-2">
                <StatusDot connected={p.connected} />
                <span className="font-medium text-sm truncate flex-1">{p.name}</span>
                {p.isBot && (
                  <Badge
                    variant="outline"
                    className="text-[9px] py-0 px-1 border-ocean/40 text-ocean bg-ocean/10 gap-0.5"
                  >
                    <BotIcon className="h-2.5 w-2.5" /> BOT
                  </Badge>
                )}
                <span className="font-mono text-sm font-bold gold-text-strong tabular-nums">
                  {formatMoney(final)}
                </span>
              </div>
              {/* Mini board — showAll=false so hidden squares stay hidden */}
              <GameBoard
                board={p.board}
                size="mini"
                showAll={false}
                highlightCoord={state.currentCoord}
                disabled
              />
              {/* Footer */}
              <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                <span>{revealedCount}/100 revealed</span>
                <span>{formatMoney(p.runningTotal)} run · {formatMoney(p.bankedTotal)} bank</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Activity feed — same look as host dashboard
// ---------------------------------------------------------------------------

function ActivityFeedPanel({ state }: { state: SpectatorGameState }) {
  const events = useMemo(
    () => [...state.activity].sort((a, b) => b.at - a.at),
    [state.activity],
  );

  return (
    <Card className="pirate-card parchment-scroll p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <ActivityIcon className="h-5 w-5 text-ocean" />
        <h2 className="display-font text-xl text-gold">Activity Feed</h2>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          live
        </span>
      </div>

      <div className="max-h-96 overflow-y-auto scroll-thin pr-1">
        {events.length === 0 ? (
          <div className="text-sm text-muted-foreground italic py-4">No activity yet.</div>
        ) : (
          <AnimatePresence initial={false}>
            {events.map((ev) => {
              const Icon = ACTIVITY_ICON[ev.type] ?? Info;
              const tone: Tone = ev.tone ?? 'neutral';
              return (
                <motion.div
                  key={ev.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className={cn(
                    'activity-row flex items-start gap-2 rounded-md border p-2 text-xs',
                    TONE_BG[tone],
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5 mt-0.5 flex-shrink-0', TONE_TEXT[tone])} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {fmtTime(ev.at)}
                      </span>
                      {ev.actor && <span className="font-semibold">{ev.actor}</span>}
                    </div>
                    <div className={cn('mt-0.5 break-words', TONE_TEXT[tone])}>
                      {ev.message}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Spectator list — who else is watching
// ---------------------------------------------------------------------------

function SpectatorListPanel({ state }: { state: SpectatorGameState }) {
  const spectators = state.spectators;
  return (
    <Card className="pirate-card watching-panel p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="flex items-center justify-center h-7 w-7 rounded-md watching-indicator">
          <Eye className="h-4 w-4" />
        </span>
        <h2 className="display-font text-xl text-gold">Watching</h2>
        <Badge variant="outline" className="ml-auto text-xs gap-1">
          <Eye className="h-3 w-3" />
          {spectators.length} {spectators.length === 1 ? 'spectator' : 'spectators'}
        </Badge>
      </div>
      {/* "You are watching" indicator — clearly visible */}
      <div
        className="mb-3 rounded-md border border-ocean/30 bg-ocean/10 px-3 py-2 text-xs flex items-center gap-2"
        role="status"
      >
        <Eye className="h-3.5 w-3.5 text-ocean animate-float-slow" />
        <span className="font-medium text-foreground/90">You are watching</span>
        <span className="text-muted-foreground">— read-only view of the live game.</span>
      </div>
      {spectators.length === 0 ? (
        <div className="text-sm text-muted-foreground italic py-2">No spectators.</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {spectators.map((s) => (
            <Badge
              key={s.id}
              variant="outline"
              className="gap-1 border-ocean/30 bg-ocean/5 text-foreground"
            >
              <Eye className="h-3 w-3 text-ocean" />
              {s.name}
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}
