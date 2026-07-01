'use client';

// ============================================================================
// Host Dashboard — real-time admin console for the Pirate Game host.
// Renders dense, organized panels driven by the server-authoritative
// HostGameState snapshot in the Zustand store.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import {
  Crosshair,
  Coins,
  Sparkles,
  Shield,
  UserPlus,
  UserMinus,
  Settings,
  Info,
  Pause,
  Play,
  Lock,
  Unlock,
  Undo2,
  Download,
  LogOut,
  Trophy,
  Users,
  Activity as ActivityIcon,
  History,
  Plus,
  Minus,
  Save,
  Send,
  Copy,
  Ban,
  Bot as BotIcon,
  ChevronRight,
  Crown,
  Medal,
  MapPin,
  Skull,
  Eye,
  RotateCcw,
  Trash2,
  Timer,
  Square,
  type LucideIcon,
} from 'lucide-react';

import { useGameStore } from '@/hooks/pirate/useGameStore';
import { useSound } from '@/components/pirate/SoundManager';
import { useTimerSound } from '@/hooks/pirate/useTimerSound';
import {
  GameBoard,
  PowerIcon,
  powerChipClass,
  powerTextClass,
  MoneyPill,
  StatusDot,
} from '@/components/pirate/common';
import { EmoteBar } from '@/components/pirate/EmoteBar';

import {
  COLUMNS,
  BOARD_SIZE,
  POWERS,
  isValidCoord,
  formatMoney,
  type Player,
  type PlayerStats,
  type PowerType,
  type ActivityEvent,
  type GameStatus,
} from '@/lib/pirate/types';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ============================================================================
// Static lookups & helpers
// ============================================================================

const STATUS_BADGE_CLASS: Record<GameStatus, string> = {
  lobby: 'bg-secondary/80 text-secondary-foreground border-border',
  playing: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40',
  ended: 'bg-destructive/15 text-destructive border-destructive/40',
};

const STATUS_LABEL: Record<GameStatus, string> = {
  lobby: 'Lobby',
  playing: 'Playing',
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

type ActivityFilter = 'all' | 'players' | 'powers' | 'host';

const ACTIVITY_FILTER_CAT: Record<ActivityEvent['type'], ActivityFilter | 'coord' | 'system'> = {
  'player-joined': 'players',
  'player-left': 'players',
  'player-reconnected': 'players',
  'coordinate-called': 'coord',
  'square-revealed': 'coord',
  'power-used': 'powers',
  'defense-used': 'powers',
  'host-action': 'host',
  system: 'system',
};

const STAT_FIELDS: Array<{ key: keyof PlayerStats; label: string; money?: boolean }> = [
  { key: 'moneyFound', label: 'Cash Found', money: true },
  { key: 'moneyStolen', label: 'Stolen (Anchor)', money: true },
  { key: 'moneyGiven', label: 'Received (Gift)', money: true },
  { key: 'moneyLost', label: 'Lost to Attacks', money: true },
  { key: 'biggestSingleFind', label: 'Biggest Find', money: true },
  { key: 'biggestMultiplierGain', label: 'Best Multiplier Gain', money: true },
  { key: 'timesAttacked', label: 'Times Attacked' },
  { key: 'timesShielded', label: 'Shields Used' },
  { key: 'timesMirrored', label: 'Mirrors Used' },
  { key: 'cashSquaresFound', label: 'Cash Squares' },
  { key: 'powerSquaresFound', label: 'Power Squares' },
];

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
}

function playerFinalScore(p: Player): number {
  return p.runningTotal + p.bankedTotal;
}

/** Triggers a re-render every `intervalMs` so relative timestamps stay fresh. */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ============================================================================
// Entry point
// ============================================================================

export default function HostDashboard() {
  const hostState = useGameStore((s) => s.hostState);
  const code = useGameStore((s) => s.code);

  if (!hostState) {
    return (
      <div className="min-h-[calc(100vh-3rem)] flex items-center justify-center p-8">
        <div className="pirate-card p-6 text-center">
          <div className="display-font text-2xl text-gold mb-2">Reconnecting to game…</div>
          <div className="text-sm text-muted-foreground">
            {code ? `Game ${code}` : 'Establishing host session'}
          </div>
        </div>
      </div>
    );
  }

  return <DashboardInner />;
}

function DashboardInner() {
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [publicFeedMode, setPublicFeedMode] = useState(false);
  // Refresh relative timestamps every 30s.
  useNow(30_000);

  if (publicFeedMode) {
    return <PublicFeedScreen onBack={() => setPublicFeedMode(false)} />;
  }

  return (
    <div className="min-h-[calc(100vh-3rem)] flex flex-col">
      <TopControlBar onPresentPublicFeed={() => setPublicFeedMode(true)} />

      <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6">
        {/* Mobile tabs */}
        <Tabs defaultValue="leaderboard" className="lg:hidden">
          <TabsList className="w-full">
            <TabsTrigger value="leaderboard" className="flex-1 gap-1">
              <Trophy className="h-3.5 w-3.5" /> Board
            </TabsTrigger>
            <TabsTrigger value="players" className="flex-1 gap-1">
              <Users className="h-3.5 w-3.5" /> Players
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex-1 gap-1">
              <ActivityIcon className="h-3.5 w-3.5" /> Feed
            </TabsTrigger>
            <TabsTrigger value="controls" className="flex-1 gap-1">
              <Settings className="h-3.5 w-3.5" /> Ctrl
            </TabsTrigger>
          </TabsList>
          <TabsContent value="leaderboard" className="space-y-4 mt-4">
            <TimerControlPanel />
            <CoordinateCallerPanel />
            <LeaderboardPanel onInspect={setInspectingId} />
          </TabsContent>
          <TabsContent value="players" className="space-y-4 mt-4">
            <PlayerListPanel onInspect={setInspectingId} />
          </TabsContent>
          <TabsContent value="activity" className="space-y-4 mt-4">
            <ActivityFeedPanel />
            <UndoPanel />
          </TabsContent>
          <TabsContent value="controls" className="space-y-4 mt-4">
            <TimerControlPanel />
            <CoordinateCallerPanel />
            <UndoPanel />
          </TabsContent>
        </Tabs>

        {/* Desktop grid */}
        <div className="hidden lg:grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <TimerControlPanel />
            <CoordinateCallerPanel />
            <LeaderboardPanel onInspect={setInspectingId} />
            <PlayerListPanel onInspect={setInspectingId} />
          </div>
          <div className="lg:col-span-1 space-y-6">
            <UndoPanel />
            <ActivityFeedPanel />
          </div>
        </div>
      </div>

      <InspectPlayerDialog
        playerId={inspectingId}
        onClose={() => setInspectingId(null)}
      />

      {/* Quick reactions — the host can cheer along with the players. */}
      <EmoteBar />
      </div>
  );
}

// ============================================================================
// Top control bar (sticky)
// ============================================================================

function TopControlBar({ onPresentPublicFeed }: { onPresentPublicFeed: () => void }) {
  const hostState = useGameStore((s) => s.hostState)!;
  const code = useGameStore((s) => s.code);
  const pauseGame = useGameStore((s) => s.pauseGame);
  const resumeGame = useGameStore((s) => s.resumeGame);
  const endGame = useGameStore((s) => s.endGame);
  const hostRevealAll = useGameStore((s) => s.hostRevealAll);
  const hostLockPlayers = useGameStore((s) => s.hostLockPlayers);
  const hostUndo = useGameStore((s) => s.hostUndo);
  const hostExport = useGameStore((s) => s.hostExport);
  const reset = useGameStore((s) => s.reset);
  const pushToast = useGameStore((s) => s.pushToast);
  const { play } = useSound();

  const status = hostState.status;
  const locked = hostState.locked;
  const currentCoord = hostState.currentCoord;
  const undoStack = hostState.undoStack;
  const lastUndoDesc = undoStack.length > 0 ? undoStack[undoStack.length - 1].description : '';

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      play('click');
      pushToast({ title: 'Code copied', description: code, tone: 'good' });
    } catch {
      pushToast({ title: 'Copy failed', tone: 'bad' });
    }
  };

  const handleExport = async () => {
    const result = await hostExport();
    if (result?.error) {
      pushToast({ title: 'Export failed', description: String(result.error), tone: 'bad' });
      return;
    }
    const json = JSON.stringify(result, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pirate-game-${code ?? 'export'}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    pushToast({ title: 'Results exported', tone: 'good' });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Game code + copy */}
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="font-mono text-base px-2.5 py-1 border-gold/40 text-gold"
            aria-label={`Game code ${code ?? ''}`}
          >
            {code ?? '------'}
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={handleCopy} aria-label="Copy game code">
                <Copy className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy game code</TooltipContent>
          </Tooltip>
        </div>

        {/* Status badge */}
        <Badge
          variant="outline"
          className={cn('uppercase tracking-wide text-xs', STATUS_BADGE_CLASS[status])}
        >
          {STATUS_LABEL[status]}
        </Badge>

        {/* Spectator count — only show when there are spectators */}
        {(hostState.spectatorCount ?? 0) > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="gap-1 text-xs border-ocean/40 text-ocean bg-ocean/10">
                <Eye className="h-3 w-3" /> {hostState.spectatorCount} watching
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Spectators currently observing this game</TooltipContent>
          </Tooltip>
        )}

        {/* Current coordinate */}
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

        {/* Action buttons */}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {status === 'playing' && (
            <>
              <Button size="sm" variant="outline" className="btn-pirate" onClick={() => { play('click'); pauseGame(); }}>
                <Pause className="h-4 w-4" /> Pause
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="btn-pirate"
                onClick={() => { play('click'); hostLockPlayers(!locked); }}
                aria-label={locked ? 'Unlock players' : 'Lock players'}
              >
                {locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                {locked ? 'Unlock' : 'Lock'}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="btn-pirate">
                    <Eye className="h-4 w-4" /> Reveal All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reveal all squares?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Every hidden square on every player&apos;s board will be revealed. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => { play('click'); hostRevealAll(); }}>
                      Reveal All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="btn-pirate"
                    onClick={() => { play('click'); hostUndo(); }}
                    disabled={undoStack.length === 0}
                  >
                    <Undo2 className="h-4 w-4" /> Undo
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {undoStack.length === 0 ? 'Nothing to undo' : `Last: ${lastUndoDesc}`}
                </TooltipContent>
              </Tooltip>

              <EndGameButton onConfirm={() => { play('click'); endGame(); }} />
            </>
          )}

          {status === 'paused' && (
            <>
              <Button size="sm" variant="default" className="btn-pirate" onClick={() => { play('click'); resumeGame(); }}>
                <Play className="h-4 w-4" /> Resume
              </Button>
              <EndGameButton onConfirm={() => { play('click'); endGame(); }} />
            </>
          )}

          {status === 'ended' && (
            <>
              <Button size="sm" variant="default" className="btn-pirate" onClick={handleExport}>
                <Download className="h-4 w-4" /> Export
              </Button>
              <Button size="sm" variant="outline" className="btn-pirate" onClick={() => { play('click'); reset(); }}>
                <RotateCcw className="h-4 w-4" /> New Game
              </Button>
            </>
          )}

          <Separator orientation="vertical" className="h-6 mx-0.5" />
          <Button size="sm" variant="outline" className="btn-pirate" onClick={onPresentPublicFeed}>
            <Eye className="h-4 w-4" /> Public Feed
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="btn-pirate"
            onClick={() => { play('click'); reset(); }}
            aria-label="Leave game"
          >
            <LogOut className="h-4 w-4" /> Leave
          </Button>
        </div>
      </div>
    </header>
  );
}

function PublicFeedScreen({ onBack }: { onBack: () => void }) {
  const hostState = useGameStore((s) => s.hostState)!;
  const code = useGameStore((s) => s.code);
  const { play } = useSound();
  const currentCoord = hostState.currentCoord;

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      play('click');
    } catch {}
  };

  return (
    <div className="min-h-[calc(100vh-3rem)] flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="font-mono text-base px-2.5 py-1 rounded-md border border-gold/40 text-gold bg-gold/5 hover:bg-gold/10 transition-colors"
            aria-label={`Game code ${code ?? ''} — click to copy`}
          >
            {code ?? '------'}
          </button>
          <Badge variant="outline" className="border-ocean/40 text-ocean bg-ocean/10 gap-1">
            <Eye className="h-3 w-3" /> PUBLIC FEED
          </Badge>
          <Badge variant="outline" className={cn('uppercase tracking-wide text-xs', STATUS_BADGE_CLASS[hostState.status])}>
            {STATUS_LABEL[hostState.status]}
          </Badge>
          <div className="flex items-center gap-1.5 ml-1 sm:ml-2">
            <MapPin className="h-4 w-4 text-gold pin-bounce" />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground hidden sm:inline">
              Now
            </span>
            <span className={cn('text-2xl sm:text-3xl font-bold text-gold display-font tabular-nums min-w-[2.5rem] text-center', currentCoord && 'coord-dramatic')} aria-live="polite">
              {currentCoord ?? '—'}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {(hostState.spectatorCount ?? 0) > 0 && (
              <Badge variant="outline" className="gap-1 text-xs border-ocean/40 text-ocean bg-ocean/10">
                <Eye className="h-3 w-3" /> {hostState.spectatorCount} watching
              </Badge>
            )}
            <Button size="sm" variant="outline" className="btn-pirate" onClick={onBack}>
              <RotateCcw className="h-4 w-4" /> Back to dashboard
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        <Card className="pirate-card p-5 sm:p-6 text-center">
          <div className="display-font text-3xl sm:text-4xl text-gold mb-2">Live Event Log</div>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            This view is meant for screensharing. It shows the current call and the running event log,
            without the admin controls, player totals, or backend panels.
          </p>
        </Card>

        <ActivityFeedPanel />
      </div>

      <EmoteBar />
    </div>
  );
}

function EndGameButton({ onConfirm }: { onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive" className="btn-pirate">
          <Skull className="h-4 w-4" /> End Game
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End the game?</AlertDialogTitle>
          <AlertDialogDescription>
            This will end the game immediately, lock the board, and compute final results &amp; awards.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>End Game</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================================
// Round Timer Control Panel — circular countdown + Start/Pause/Resume/Stop
// ============================================================================

function TimerControlPanel() {
  const hostState = useGameStore((s) => s.hostState)!;
  const startTimer = useGameStore((s) => s.startTimer);
  const pauseTimer = useGameStore((s) => s.pauseTimer);
  const resumeTimer = useGameStore((s) => s.resumeTimer);
  const stopTimer = useGameStore((s) => s.stopTimer);
  const { play } = useSound();

  const timer = hostState.roundTimer;
  // Drive the countdown tick + beep sounds from the host view too — the
  // host should hear the same urgency cues the players do.
  useTimerSound(timer?.remaining, timer?.active);

  // Hide the panel entirely when no timer is configured (duration 0).
  if (!timer || timer.duration <= 0) return null;

  const { duration, remaining, active } = timer;
  const status = hostState.status;
  const isLow = active && remaining <= 3;
  const progress = duration > 0 ? remaining / duration : 0;

  // SVG ring geometry
  const RADIUS = 46;
  const CIRC = 2 * Math.PI * RADIUS;
  const dashOffset = CIRC * (1 - progress);

  const ringColor = isLow
    ? 'stroke-destructive'
    : active
      ? 'stroke-gold'
      : 'stroke-ocean';

  const handleStart = () => { play('click'); startTimer(); };
  const handlePause = () => { play('click'); pauseTimer(); };
  const handleResume = () => { play('click'); resumeTimer(); };
  const handleStop = () => { play('click'); stopTimer(); };

  return (
    <Card className={cn('pirate-card p-4 sm:p-6 overflow-hidden', isLow && 'ring-2 ring-destructive/60')}>
      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
        {/* Circular countdown */}
        <div className="relative shrink-0" aria-live="polite">
          <motion.div
            animate={
              isLow
                ? { scale: [1, 1.06, 1] }
                : { scale: 1 }
            }
            transition={
              isLow
                ? { duration: 0.7, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.3 }
            }
            className="relative"
          >
            <svg
              width="120"
              height="120"
              viewBox="0 0 120 120"
              className="-rotate-90"
              aria-hidden
            >
              {/* track */}
              <circle
                cx="60"
                cy="60"
                r={RADIUS}
                fill="none"
                strokeWidth="8"
                className="stroke-muted/40"
              />
              {/* progress arc — animated smoothly between ticks */}
              <motion.circle
                cx="60"
                cy="60"
                r={RADIUS}
                fill="none"
                strokeWidth="8"
                strokeLinecap="round"
                className={ringColor}
                strokeDasharray={CIRC}
                initial={false}
                animate={{ strokeDashoffset: dashOffset }}
                transition={
                  active
                    ? { duration: 1, ease: 'linear' }
                    : { duration: 0.25, ease: 'easeOut' }
                }
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={remaining}
                  initial={{ opacity: 0, y: -8, scale: 0.7 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.7 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className={cn(
                    'font-display font-bold tabular-nums leading-none',
                    'text-4xl sm:text-5xl',
                    isLow ? 'text-destructive' : active ? 'text-gold' : 'text-ocean',
                  )}
                >
                  {remaining}
                </motion.span>
              </AnimatePresence>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                seconds
              </span>
            </div>
          </motion.div>
        </div>

        {/* Info + controls */}
        <div className="flex-1 min-w-0 w-full sm:w-auto space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Timer className={cn('h-4 w-4', active ? 'text-gold' : 'text-ocean')} />
            <h2 className="display-font text-lg sm:text-xl text-gold">
              Auto-Advance Timer
            </h2>
            <Badge
              variant="outline"
              className="ml-auto text-[10px] gap-0.5 border-ocean/40 text-ocean bg-ocean/10"
            >
              <Timer className="h-2.5 w-2.5" />
              Auto · {duration}s
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground leading-snug">
            {active
              ? isLow
                ? `Auto-calling next coordinate in ${remaining}s — reveal fast!`
                : `Next coordinate auto-called in ${remaining}s. Manual calls reset the timer.`
              : status === 'paused'
                ? `Game is paused — timer paused at ${remaining}s.`
                : status === 'ended'
                  ? `Game ended — timer stopped.`
                  : `Timer ready — press Start to begin the countdown.`}
          </p>

          {/* Controls */}
          <div className="flex flex-wrap gap-2">
            {!active && status === 'playing' && remaining === duration && (
              <Button
                size="sm"
                onClick={handleStart}
                className="btn-pirate bg-gold text-gold-foreground hover:bg-gold/90 min-h-[40px]"
              >
                <Play className="h-4 w-4" /> Start
              </Button>
            )}
            {!active && status === 'playing' && remaining !== duration && (
              <Button
                size="sm"
                onClick={handleResume}
                className="btn-pirate bg-gold text-gold-foreground hover:bg-gold/90 min-h-[40px]"
              >
                <Play className="h-4 w-4" /> Resume
              </Button>
            )}
            {active && (
              <Button
                size="sm"
                variant="outline"
                onClick={handlePause}
                className="btn-pirate min-h-[40px]"
              >
                <Pause className="h-4 w-4" /> Pause
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleStop}
              disabled={!active && remaining === duration}
              className="btn-pirate text-destructive hover:bg-destructive/10 hover:text-destructive min-h-[40px]"
            >
              <Square className="h-4 w-4" /> Stop
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// Coordinate caller panel
// ============================================================================

function CoordinateCallerPanel() {
  const hostState = useGameStore((s) => s.hostState)!;
  const callCoordinate = useGameStore((s) => s.callCoordinate);
  const pushToast = useGameStore((s) => s.pushToast);
  const { play } = useSound();

  const [coordInput, setCoordInput] = useState('');

  const calledSet = useMemo(
    () => new Set(hostState.calledCoordinates),
    [hostState.calledCoordinates],
  );

  const recent = useMemo(
    () => [...hostState.calledCoordinates].slice(-10).reverse(),
    [hostState.calledCoordinates],
  );

  const submit = (raw: string) => {
    const coord = raw.trim().toUpperCase();
    if (!isValidCoord(coord)) {
      play('error');
      pushToast({ title: 'Invalid coordinate', description: `"${raw}" is not A1–J10.`, tone: 'bad' });
      return;
    }
    play('click');
    callCoordinate(coord);
    setCoordInput('');
  };

  return (
    <Card className="pirate-card p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <Crosshair className="h-5 w-5 text-gold" />
        <h2 className="display-font text-xl text-gold">Coordinate Caller</h2>
        <Badge variant="outline" className="ml-auto text-xs">
          {hostState.calledCoordinates.length} called
        </Badge>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1">
          <Label
            htmlFor="coord-input"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Coordinate (A1–J10)
          </Label>
          <Input
            id="coord-input"
            value={coordInput}
            onChange={(e) => setCoordInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(coordInput); }}
            placeholder="e.g. F7"
            className="font-mono text-lg uppercase"
            maxLength={3}
            inputMode="text"
            autoCapitalize="characters"
          />
        </div>
        <Button
          size="lg"
          onClick={() => submit(coordInput)}
          className="bg-gold/20 text-gold border border-gold/40 hover:bg-gold/30 min-h-[44px]"
        >
          <Send className="h-4 w-4" /> Call
        </Button>
      </div>

      {/* Quick-call grid */}
      <div className="mt-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Quick Call (tap a square)
        </div>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: BOARD_SIZE * BOARD_SIZE }).map((_, idx) => {
            const col = COLUMNS[idx % BOARD_SIZE];
            const row = Math.floor(idx / BOARD_SIZE) + 1;
            const coord = `${col}${row}`;
            const isCalled = calledSet.has(coord);
            const isCurrent = hostState.currentCoord === coord;
            return (
              <button
                key={coord}
                type="button"
                onClick={() => submit(coord)}
                className={cn(
                  'aspect-square rounded-sm text-[9px] sm:text-[10px] font-mono font-semibold border transition-colors',
                  'min-h-[36px] flex items-center justify-center',
                  isCurrent
                    ? 'bg-gold text-gold-foreground border-gold ring-2 ring-gold/60'
                    : isCalled
                      ? 'bg-ocean/20 border-ocean/50 text-ocean'
                      : 'bg-secondary/60 border-border text-muted-foreground hover:bg-gold/15 hover:border-gold/40 hover:text-gold',
                )}
                aria-label={`Call coordinate ${coord}`}
              >
                {coord}
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent calls */}
      <div className="mt-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
          <History className="h-3.5 w-3.5" /> Recently Called
        </div>
        {recent.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">No coordinates called yet.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {recent.map((c, i) => (
              <Badge
                key={`${c}-${i}`}
                variant="outline"
                className={cn(
                  'font-mono',
                  i === 0
                    ? 'border-gold/60 text-gold bg-gold/10'
                    : 'border-border text-muted-foreground',
                )}
              >
                {c}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ============================================================================
// Live leaderboard
// ============================================================================

function LeaderboardPanel({ onInspect }: { onInspect: (id: string) => void }) {
  const hostState = useGameStore((s) => s.hostState)!;
  const sorted = useMemo(
    () => [...hostState.players].sort((a, b) => playerFinalScore(b) - playerFinalScore(a)),
    [hostState.players],
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
        <div className="text-sm text-muted-foreground italic py-4">No players yet.</div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {sorted.map((p, idx) => {
              const rank = idx + 1;
              const final = playerFinalScore(p);
              return (
                <motion.button
                  key={p.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  onClick={() => onInspect(p.id)}
                  className={cn(
                    'w-full text-left rounded-lg border p-3 flex items-center gap-3 hover:bg-accent/50 transition-colors min-h-[44px]',
                    rank === 1 && 'border-gold/60 bg-gold/10',
                    rank === 2 && 'border-zinc-400/40 bg-zinc-400/10',
                    rank === 3 && 'border-orange-700/40 bg-orange-700/10',
                    rank > 3 && 'border-border bg-card/60',
                  )}
                  aria-label={`Inspect ${p.name}, rank ${rank}`}
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
                        <Badge
                          variant="outline"
                          className="text-[10px] py-0 px-1 border-gold/40 text-gold"
                        >
                          HOST
                        </Badge>
                      )}
                      {p.isBot && (
                        <Badge
                          variant="outline"
                          className="text-[10px] py-0 px-1 border-ocean/40 text-ocean bg-ocean/10 gap-0.5"
                        >
                          <BotIcon className="h-2.5 w-2.5" />
                          BOT
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {p.inventory.length} {p.inventory.length === 1 ? 'item' : 'items'} ·{' '}
                      {p.board.filter((s) => s.revealed).length}/100 revealed
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
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// Player list panel
// ============================================================================

function PlayerListPanel({ onInspect }: { onInspect: (id: string) => void }) {
  const hostState = useGameStore((s) => s.hostState)!;
  const players = hostState.players;

  return (
    <Card className="pirate-card p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-5 w-5 text-ocean" />
        <h2 className="display-font text-xl text-gold">Players</h2>
        <Badge variant="outline" className="ml-auto text-xs">
          {players.length} total
        </Badge>
      </div>

      {players.length === 0 ? (
        <div className="text-sm text-muted-foreground italic py-4">No players yet.</div>
      ) : (
        <div className="max-h-96 overflow-y-auto scroll-thin space-y-1.5 pr-1">
          {players.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onInspect(p.id)}
              className={cn(
                'w-full text-left rounded-lg border border-border bg-card/60 p-2.5 flex items-center gap-3 hover:bg-accent/50 transition-colors min-h-[44px]',
                !p.connected && 'opacity-60',
              )}
              aria-label={`Inspect ${p.name}`}
            >
              <StatusDot connected={p.connected} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium truncate">{p.name}</span>
                  {p.isHost && (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 px-1 border-gold/40 text-gold"
                    >
                      HOST
                    </Badge>
                  )}
                  {p.isBot && (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 px-1 border-ocean/40 text-ocean bg-ocean/10 gap-0.5"
                    >
                      <BotIcon className="h-2.5 w-2.5" />
                      BOT
                    </Badge>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Joined {formatDistanceToNow(new Date(p.joinedAt), { addSuffix: true })}
                  {p.lastMove && p.lastMoveAt ? (
                    <>
                      {' '}· Last move <span className="font-mono">{p.lastMove}</span>{' '}
                      ({formatDistanceToNow(new Date(p.lastMoveAt), { addSuffix: true })})
                    </>
                  ) : null}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-gold">
                  {formatMoney(playerFinalScore(p))}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {p.connected ? 'online' : 'offline'}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// Inspect Player dialog (with Board / Stats / Manage tabs)
// ============================================================================

function InspectPlayerDialog({
  playerId,
  onClose,
}: {
  playerId: string | null;
  onClose: () => void;
}) {
  const hostState = useGameStore((s) => s.hostState)!;
  const player = useMemo(
    () => (playerId ? hostState.players.find((p) => p.id === playerId) ?? null : null),
    [hostState.players, playerId],
  );

  const open = !!playerId && !!player;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col gap-4"
        aria-describedby="inspect-desc"
      >
        {player ? (
          <InspectPlayerContent key={player.id} player={player} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function InspectPlayerContent({
  player,
  onClose,
}: {
  player: Player;
  onClose: () => void;
}) {
  const hostState = useGameStore((s) => s.hostState)!;
  const hostRevealSquare = useGameStore((s) => s.hostRevealSquare);
  const hostForceAward = useGameStore((s) => s.hostForceAward);
  const hostForceRemove = useGameStore((s) => s.hostForceRemove);
  const hostEditTotal = useGameStore((s) => s.hostEditTotal);
  const hostEditInventory = useGameStore((s) => s.hostEditInventory);
  const hostKick = useGameStore((s) => s.hostKick);
  const removeBot = useGameStore((s) => s.removeBot);
  const pushToast = useGameStore((s) => s.pushToast);
  const { play } = useSound();

  const [awardAmount, setAwardAmount] = useState('100');
  const [removeAmount, setRemoveAmount] = useState('100');
  const [runningInput, setRunningInput] = useState(String(player.runningTotal));
  const [bankedInput, setBankedInput] = useState(String(player.bankedTotal));
  const [invSelect, setInvSelect] = useState<PowerType>('shield');

  const final = playerFinalScore(player);
  const revealedCount = player.board.filter((s) => s.revealed).length;
  const history = useMemo(() => [...player.history].slice(-20).reverse(), [player.history]);

  const handleSaveTotals = () => {
    const r = parseInt(runningInput, 10);
    const b = parseInt(bankedInput, 10);
    if (Number.isNaN(r) || Number.isNaN(b)) {
      pushToast({ title: 'Invalid totals', tone: 'bad' });
      return;
    }
    play('click');
    if (r !== player.runningTotal) hostEditTotal(player.id, 'running', r);
    if (b !== player.bankedTotal) hostEditTotal(player.id, 'banked', b);
    pushToast({ title: 'Totals saved', tone: 'good' });
  };

  const handleAward = () => {
    const n = parseInt(awardAmount, 10);
    if (Number.isNaN(n) || n <= 0) {
      pushToast({ title: 'Invalid amount', tone: 'bad' });
      return;
    }
    play('click');
    hostForceAward(player.id, n);
    pushToast({ title: `Awarded ${formatMoney(n)}`, description: player.name, tone: 'good' });
  };

  const handleRemove = () => {
    const n = parseInt(removeAmount, 10);
    if (Number.isNaN(n) || n <= 0) {
      pushToast({ title: 'Invalid amount', tone: 'bad' });
      return;
    }
    play('click');
    hostForceRemove(player.id, n);
    pushToast({ title: `Removed ${formatMoney(n)}`, description: player.name, tone: 'bad' });
  };

  const handleAddInventory = () => {
    play('click');
    hostEditInventory(player.id, 'add', invSelect);
    pushToast({
      title: `Added ${POWERS[invSelect].label}`,
      description: player.name,
      tone: 'good',
    });
  };

  const handleRemoveInventory = () => {
    play('click');
    hostEditInventory(player.id, 'remove', invSelect);
    pushToast({
      title: `Removed ${POWERS[invSelect].label}`,
      description: player.name,
      tone: 'info',
    });
  };

  const handleKick = () => {
    play('click');
    hostKick(player.id);
    onClose();
    pushToast({ title: `Kicked ${player.name}`, tone: 'bad' });
  };

  const handleRemoveBot = () => {
    play('click');
    removeBot(player.id);
    onClose();
    pushToast({ title: `Removed bot ${player.name}`, tone: 'bad' });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="display-font text-2xl text-gold flex items-center gap-2">
          <StatusDot connected={player.connected} />
          {player.name}
          {player.isHost && (
            <Badge variant="outline" className="text-[10px] border-gold/40 text-gold">
              HOST
            </Badge>
          )}
          {player.isBot && (
            <Badge variant="outline" className="text-[10px] border-ocean/40 text-ocean bg-ocean/10 gap-0.5">
              <BotIcon className="h-2.5 w-2.5" />
              BOT
            </Badge>
          )}
        </DialogTitle>
        <DialogDescription id="inspect-desc">
          Inspect board, stats, and apply host overrides.
        </DialogDescription>
      </DialogHeader>

      {/* Money summary */}
      <div className="grid grid-cols-3 gap-2">
        <MoneyPill value={player.runningTotal} label="Running" tone="ocean" variant="at-risk" />
        <MoneyPill value={player.bankedTotal} label="Banked" tone="gold" variant="banked" />
        <MoneyPill value={final} label="Final" tone="gold" />
      </div>

      <Tabs defaultValue="board" className="flex-1 overflow-hidden flex flex-col min-h-0">
        <TabsList className="self-start">
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="manage">Manage</TabsTrigger>
        </TabsList>

        {/* Board tab */}
        <TabsContent value="board" className="overflow-y-auto scroll-thin pr-1 mt-2">
          <div className="text-xs text-muted-foreground mb-2">
            Tap any square to toggle its reveal state on this player&apos;s board. Hidden squares are visible to you (host).
            <span className="ml-1 font-mono text-gold">{revealedCount}/100 revealed.</span>
          </div>
          <GameBoard
            board={player.board}
            showAll
            size="md"
            highlightCoord={hostState.currentCoord}
            onSquareClick={(coord) => { play('click'); hostRevealSquare(player.id, coord); }}
          />

          {/* Inventory */}
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Inventory ({player.inventory.length})
            </div>
            {player.inventory.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">No defensive items.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {player.inventory.map((it, i) => (
                  <div
                    key={`${it.type}-${i}`}
                    className={cn(
                      'rounded-md border px-2 py-1 flex items-center gap-1.5 text-xs',
                      powerChipClass(it.type),
                    )}
                  >
                    <PowerIcon power={it.type} className="h-3.5 w-3.5" />
                    <span className={powerTextClass(it.type)}>{POWERS[it.type].label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* History */}
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              History (last 20)
            </div>
            {history.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">No history yet.</div>
            ) : (
              <div className="max-h-48 overflow-y-auto scroll-thin space-y-1 pr-1">
                {history.map((h, i) => (
                  <div
                    key={`${i}-${h.at}`}
                    className="text-xs flex items-center gap-2 border-b border-border/50 pb-1"
                  >
                    <span className="font-mono text-muted-foreground">{fmtTime(h.at)}</span>
                    {h.coord && (
                      <Badge variant="outline" className="font-mono text-[10px] py-0">
                        {h.coord}
                      </Badge>
                    )}
                    <span className="flex-1">{h.text}</span>
                    {h.delta !== undefined && h.delta !== 0 && (
                      <span
                        className={cn(
                          'font-mono font-bold',
                          h.delta > 0 ? 'text-emerald-500' : 'text-destructive',
                        )}
                      >
                        {h.delta > 0 ? '+' : ''}
                        {formatMoney(h.delta)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Stats tab */}
        <TabsContent value="stats" className="overflow-y-auto scroll-thin pr-1 mt-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {STAT_FIELDS.map(({ key, label, money }) => {
              const val = player.stats[key];
              return (
                <div
                  key={String(key)}
                  className="rounded-lg border border-border bg-card/60 p-2.5"
                >
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {label}
                  </div>
                  <div className="font-mono font-bold text-sm mt-0.5">
                    {money ? formatMoney(val) : val}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* Manage tab */}
        <TabsContent value="manage" className="overflow-y-auto scroll-thin pr-1 mt-2 space-y-4">
          {/* Force award / remove */}
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Force Money
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[120px]">
                <Label htmlFor="award-input" className="text-xs">Award $</Label>
                <Input
                  id="award-input"
                  type="number"
                  value={awardAmount}
                  onChange={(e) => setAwardAmount(e.target.value)}
                  className="font-mono"
                  min={0}
                />
              </div>
              <Button
                size="sm"
                onClick={handleAward}
                className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-[40px]"
              >
                <Plus className="h-4 w-4" /> Award
              </Button>
              <div className="flex-1 min-w-[120px]">
                <Label htmlFor="remove-input" className="text-xs">Remove $</Label>
                <Input
                  id="remove-input"
                  type="number"
                  value={removeAmount}
                  onChange={(e) => setRemoveAmount(e.target.value)}
                  className="font-mono"
                  min={0}
                />
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleRemove}
                className="min-h-[40px]"
              >
                <Minus className="h-4 w-4" /> Remove
              </Button>
            </div>
          </div>

          <Separator />

          {/* Edit totals */}
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Edit Totals
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[120px]">
                <Label htmlFor="running-input" className="text-xs">Running $</Label>
                <Input
                  id="running-input"
                  type="number"
                  value={runningInput}
                  onChange={(e) => setRunningInput(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="flex-1 min-w-[120px]">
                <Label htmlFor="banked-input" className="text-xs">Banked $</Label>
                <Input
                  id="banked-input"
                  type="number"
                  value={bankedInput}
                  onChange={(e) => setBankedInput(e.target.value)}
                  className="font-mono"
                />
              </div>
              <Button size="sm" variant="outline" onClick={handleSaveTotals} className="min-h-[40px]">
                <Save className="h-4 w-4" /> Save
              </Button>
            </div>
            <div className="text-[10px] text-muted-foreground">
              Current: {formatMoney(player.runningTotal)} running · {formatMoney(player.bankedTotal)} banked
            </div>
          </div>

          <Separator />

          {/* Edit inventory */}
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Edit Inventory
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[180px]">
                <Label htmlFor="inv-select" className="text-xs">Power</Label>
                <Select value={invSelect} onValueChange={(v) => setInvSelect(v as PowerType)}>
                  <SelectTrigger id="inv-select" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(POWERS).map((meta) => (
                      <SelectItem key={meta.type} value={meta.type}>
                        <div className="flex items-center gap-2">
                          <PowerIcon power={meta.type} className="h-3.5 w-3.5" />
                          <span>{meta.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={handleAddInventory} className="min-h-[40px]">
                <Plus className="h-4 w-4" /> Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRemoveInventory}
                className="min-h-[40px]"
              >
                <Minus className="h-4 w-4" /> Remove
              </Button>
            </div>
          </div>

          <Separator />

          {/* Danger zone */}
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-destructive">
              Danger Zone
            </div>
            {player.isBot ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="min-h-[40px]"
                  >
                    <Trash2 className="h-4 w-4" /> Remove Bot
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove {player.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This bot will be removed from the game immediately.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRemoveBot}>Remove Bot</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={player.isHost}
                    className="min-h-[40px]"
                  >
                    <Ban className="h-4 w-4" /> Kick Player
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Kick {player.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      They will be removed from the game immediately. They can rejoin if the game is
                      unlocked.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleKick}>Kick</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {player.isHost && (
              <div className="text-[10px] text-muted-foreground italic">
                You cannot kick the host.
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

// ============================================================================
// Undo panel (compact)
// ============================================================================

function UndoPanel() {
  const hostState = useGameStore((s) => s.hostState)!;
  const hostUndo = useGameStore((s) => s.hostUndo);
  const { play } = useSound();
  const undoStack = hostState.undoStack;
  const recent = useMemo(() => [...undoStack].slice(-5).reverse(), [undoStack]);

  return (
    <Card className="pirate-card p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <History className="h-5 w-5 text-gold" />
        <h2 className="display-font text-xl text-gold">Undo</h2>
        <Badge variant="outline" className="ml-auto text-xs">
          {undoStack.length} {undoStack.length === 1 ? 'entry' : 'entries'}
        </Badge>
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={() => { play('click'); hostUndo(); }}
        disabled={undoStack.length === 0}
        className="w-full mb-3 min-h-[44px]"
      >
        <Undo2 className="h-4 w-4" /> Undo Last Action
      </Button>

      {recent.length === 0 ? (
        <div className="text-sm text-muted-foreground italic">No undo history.</div>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto scroll-thin pr-1">
          {recent.map((u, i) => (
            <div
              key={u.id}
              className={cn(
                'text-xs rounded-md border border-border bg-card/60 p-2',
                i === 0 && 'border-gold/40 bg-gold/5',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{u.description}</span>
                {i === 0 && (
                  <Badge
                    variant="outline"
                    className="text-[10px] py-0 px-1 border-gold/40 text-gold flex-shrink-0"
                  >
                    NEXT
                  </Badge>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {formatDistanceToNow(new Date(u.at), { addSuffix: true })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// Activity feed
// ============================================================================

function ActivityFeedPanel() {
  const hostState = useGameStore((s) => s.hostState)!;
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const events = useMemo(() => {
    const sorted = [...hostState.activity].sort((a, b) => b.at - a.at);
    if (filter === 'all') return sorted;
    return sorted.filter((e) => {
      const cat = ACTIVITY_FILTER_CAT[e.type];
      if (filter === 'players') return cat === 'players';
      if (filter === 'powers') return cat === 'powers';
      if (filter === 'host') return cat === 'host' || cat === 'system';
      return true;
    });
  }, [hostState.activity, filter]);

  const filters: ActivityFilter[] = ['all', 'players', 'powers', 'host'];

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

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors min-h-[32px]',
              filter === f
                ? 'border-gold/60 bg-gold/15 text-gold'
                : 'border-border text-muted-foreground hover:bg-accent/50',
            )}
            aria-pressed={filter === f}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="max-h-[28rem] overflow-y-auto scroll-thin space-y-1.5 pr-1">
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
                    'flex items-start gap-2 rounded-md border p-2 text-xs',
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
