'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Coins,
  Landmark,
  Trophy,
  Lock,
  Wifi,
  WifiOff,
  Clock,
  Pause,
  Users,
  ChevronRight,
  Shield,
  FlipHorizontal,
  Skull,
  Crown,
  History,
  MapPin,
  PackageOpen,
  Sparkles,
  Flame,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { useGameStore } from '@/hooks/pirate/useGameStore';
import { useSound } from '@/components/pirate/SoundManager';
import { useTimerSound } from '@/hooks/pirate/useTimerSound';
import {
  GameBoard,
  PowerIcon,
  StatusDot,
  powerChipClass,
  powerTextClass,
} from '@/components/pirate/common';
import { EmoteBar } from '@/components/pirate/EmoteBar';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  POWERS,
  formatMoney,
  type DefenseChoice,
  type DefensePrompt,
  type PlayerHistoryEntry,
  type PlayerGameState,
  type PowerType,
} from '@/lib/pirate/types';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HISTORY_KIND_META: Record<
  PlayerHistoryEntry['kind'],
  { icon: LucideIcon; color: string; bg: string; border: string }
> = {
  cash: { icon: Coins, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-l-emerald-500' },
  power: { icon: Sparkles, color: 'text-gold', bg: 'bg-gold/10', border: 'border-l-gold' },
  attack: { icon: Flame, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-l-red-500' },
  defense: { icon: Shield, color: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-l-sky-500' },
  system: { icon: History, color: 'text-muted-foreground', bg: 'bg-muted/40', border: 'border-l-muted-foreground' },
};

function formatClock(at: number): string {
  const d = new Date(at);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Round Timer Indicator — small countdown chip with a shrinking progress bar.
// Pulses red when remaining ≤ 3s. Hidden when no timer is configured.
// ---------------------------------------------------------------------------

function RoundTimerIndicator({
  timer,
}: {
  timer: { duration: number; remaining: number; active: boolean } | undefined;
}) {
  // Drive the countdown tick + beep sounds. Must be called before any early
  // return — passing `undefined` is safe (the hook no-ops when there's no
  // timer configured).
  useTimerSound(timer?.remaining, timer?.active);

  if (!timer || timer.duration <= 0) return null;
  const { duration, remaining, active } = timer;
  const isLow = active && remaining <= 3;
  const pct = duration > 0 ? Math.max(0, Math.min(100, (remaining / duration) * 100)) : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={
          isLow
            ? { opacity: 1, scale: [1, 1.06, 1] }
            : { opacity: 1, scale: 1 }
        }
        exit={{ opacity: 0, scale: 0.85 }}
        transition={
          isLow
            ? { scale: { duration: 0.6, repeat: Infinity, ease: 'easeInOut' } }
            : { duration: 0.2 }
        }
        className={cn(
          'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-mono font-semibold tabular-nums',
          isLow
            ? 'bg-destructive/15 text-destructive border-destructive/50'
            : active
              ? 'bg-gold/15 text-gold border-gold/40'
              : 'bg-ocean/10 text-ocean border-ocean/40',
        )}
        role="status"
        aria-label={
          active
            ? `Auto-call in ${remaining} seconds`
            : `Timer paused at ${remaining} seconds`
        }
        title={
          active
            ? `Next coordinate auto-called in ${remaining}s`
            : `Timer paused`
        }
      >
        <Timer className={cn('h-3 w-3', isLow && 'animate-pulse')} />
        <span className="leading-none">{active ? `${remaining}s` : '⏸'}</span>
        {/* Shrinking progress bar */}
        <span className="relative ml-1 h-1.5 w-10 overflow-hidden rounded-full bg-current/20">
          <motion.span
            className={cn(
              'absolute inset-y-0 left-0 rounded-full',
              isLow ? 'bg-destructive' : active ? 'bg-gold' : 'bg-ocean',
            )}
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={
              active
                ? { duration: 1, ease: 'linear' }
                : { duration: 0.25, ease: 'easeOut' }
            }
          />
        </span>
      </motion.div>
    </AnimatePresence>
  );
}

// Animated value — pops on change via key-based AnimatePresence
function AnimatedValue({ value }: { value: number }) {
  return (
    <span className="relative inline-block tabular-nums">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: -10, scale: 0.7 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.7 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="inline-block"
        >
          {formatMoney(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function AnimatedCount({ value }: { value: number }) {
  return (
    <span className="relative inline-block tabular-nums">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: -10, scale: 0.7 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.7 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="inline-block"
        >
          {new Intl.NumberFormat().format(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// Money stat card with tone + animated value
type MoneyStatVariant = 'at-risk' | 'banked' | 'default';

function MoneyStat({
  label,
  value,
  tone,
  icon,
  hint,
  variant = 'default',
  format = 'money',
}: {
  label: string;
  value: number;
  tone: 'gold' | 'ocean' | 'default';
  icon: React.ReactNode;
  hint?: string;
  variant?: MoneyStatVariant;
  format?: 'money' | 'count';
}) {
  const toneClass = {
    default: 'bg-secondary/60 text-foreground border-border',
    gold: 'bg-gold/15 text-gold border-gold/40',
    ocean: 'bg-ocean/15 text-ocean border-ocean/40',
  }[tone];
  const variantClass =
    variant === 'at-risk' ? 'money-at-risk' : variant === 'banked' ? 'money-banked' : '';

  // Track previous value to flash gain/loss
  const prevRef = useRef<number | null>(null);
  const [flashClass, setFlashClass] = useState('');
  useEffect(() => {
    if (prevRef.current === null) {
      prevRef.current = value;
      return;
    }
    if (prevRef.current === value) return;
    const delta = value - prevRef.current;
    prevRef.current = value;
    setFlashClass(delta > 0 ? 'money-flash-gain' : 'money-flash-loss');
    const t = window.setTimeout(() => setFlashClass(''), 750);
    return () => window.clearTimeout(t);
  }, [value]);

  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2.5 flex flex-col gap-0.5 min-w-0 transition-colors',
        toneClass,
        variantClass,
        flashClass,
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide opacity-80">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-lg sm:text-xl font-bold font-mono tabular-nums flex items-center gap-1">
        {variant === 'at-risk' && <Coins className="h-3.5 w-3.5 text-gold/80 shrink-0" />}
        {variant === 'banked' && <Lock className="h-3.5 w-3.5 text-ocean/80 shrink-0" />}
        {format === 'count' ? <AnimatedCount value={value} /> : <AnimatedValue value={value} />}
      </div>
      {hint && <div className="text-[10px] opacity-70 truncate">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Target Selection Modal
// ---------------------------------------------------------------------------

function TargetSelectionModal({
  open,
  power,
  rivals,
  busy,
  onSelect,
  onClose,
}: {
  open: boolean;
  power: PowerType | null;
  rivals: PlayerGameState['rivals'];
  busy: boolean;
  onSelect: (targetId: string, targetName: string) => void;
  onClose: () => void;
}) {
  if (!power) return null;
  const meta = POWERS[power];
  const hideTotals = power === 'swap' || power === 'anchor' || power === 'fire';
  // Only sort by money when the totals are allowed to be shown.
  const sortedRivals = hideTotals
    ? [...rivals].sort((a, b) => a.name.localeCompare(b.name))
    : [...rivals].sort((a, b) => b.runningTotal - a.runningTotal);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent
        showCloseButton={!busy}
        aria-describedby={undefined}
        className="sm:max-w-md max-h-[90vh] flex flex-col"
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'rounded-lg p-2 border shrink-0',
                powerChipClass(power),
              )}
            >
              <PowerIcon power={power} className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-display text-xl">
                Choose a target for {meta.label}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {meta.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scroll-thin -mx-1 px-1 flex flex-col gap-2 mt-1">
          {sortedRivals.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              No rivals to target. Wait for other players to join!
            </div>
          ) : (
            sortedRivals.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={busy || !r.connected}
                onClick={() => onSelect(r.id, r.name)}
                aria-label={
                  hideTotals
                    ? `Target ${r.name}. Totals hidden until the action resolves.`
                    : `Target ${r.name} who has ${formatMoney(r.runningTotal)} at risk`
                }
                className={cn(
                  'flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-card/60 px-3 py-2.5 text-left transition-colors',
                  'hover:bg-accent/60 hover:border-gold/40 disabled:opacity-50 disabled:cursor-not-allowed',
                  'min-h-[44px]',
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <StatusDot connected={r.connected} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm truncate">{r.name}</span>
                      {r.isHost && <Crown className="h-3 w-3 text-gold shrink-0" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.inventoryCount} defensive {r.inventoryCount === 1 ? 'item' : 'items'}
                      {!r.connected && ' · disconnected'}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0 min-w-[4.5rem]">
                  {hideTotals ? (
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Hidden until chosen
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-mono font-semibold text-gold">
                        {formatMoney(r.runningTotal)}
                      </div>
                      <div className="text-[10px] text-ocean">
                        banked {formatMoney(r.bankedTotal)}
                      </div>
                    </>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Defense Modal — non-dismissable, with countdown
// ---------------------------------------------------------------------------

function DefenseModal({
  prompt,
  busy,
  onResolve,
}: {
  prompt: DefensePrompt | null;
  busy: boolean;
  onResolve: (choice: DefenseChoice) => void;
}) {
  // Tick state to force re-render every 250ms while prompt is active.
  // setState is only ever called inside the setInterval callback (not in
  // the effect body), so this is lint-safe re: react-hooks/set-state-in-effect.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!prompt) return;
    const interval = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(interval);
  }, [prompt]);

  // Play the appropriate sound when a new prompt arrives.
  const lastPromptIdRef = useRef<string | null>(null);
  const { play } = useSound();
  useEffect(() => {
    if (!prompt) {
      lastPromptIdRef.current = null;
      return;
    }
    if (lastPromptIdRef.current === prompt.promptId) return;
    lastPromptIdRef.current = prompt.promptId;
    const map: Partial<Record<PowerType, 'anchor' | 'fire' | 'power' | 'splash'>> = {
      anchor: 'anchor',
      fire: 'fire',
      swap: 'power',
    };
    play(map[prompt.attackType] ?? 'power');
  }, [prompt, play]);

  if (!prompt) return null;

  const meta = POWERS[prompt.attackType];
  const ms = prompt.deadline - Date.now();
  const remaining = Math.max(0, Math.ceil(ms / 1000));
  const auto = ms <= 0;
  const mirrorFirst = prompt.hasMirror; // Mirror takes precedence

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        aria-describedby="defense-desc"
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'rounded-lg p-2 border shrink-0 animate-pulse',
                powerChipClass(prompt.attackType),
              )}
            >
              <PowerIcon power={prompt.attackType} className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-display text-xl text-destructive">
                Under attack!
              </DialogTitle>
              <DialogDescription id="defense-desc" className="mt-1">
                <span className="font-semibold text-foreground">
                  {prompt.attackerName}
                </span>{' '}
                used{' '}
                <span className={cn('font-semibold', powerTextClass(prompt.attackType))}>
                  {meta.label}
                </span>
                {typeof prompt.amount === 'number' && (
                  <>
                    {' '}— would steal{' '}
                    <span className="font-mono text-gold">
                      {formatMoney(prompt.amount)}
                    </span>
                  </>
                )}
                .
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center justify-center gap-2 my-1">
          <Clock
            className={cn(
              'h-4 w-4',
              auto ? 'text-destructive' : 'text-amber-500',
            )}
          />
          <span
            className={cn(
              'font-mono text-lg font-bold tabular-nums',
              auto ? 'text-destructive' : 'text-amber-500',
            )}
            aria-live="polite"
          >
            {auto ? 'Auto-resolving…' : `${remaining}s`}
          </span>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {prompt.hasMirror && (
            <Button
              variant="default"
              size="lg"
              disabled={busy || auto}
              onClick={() => onResolve('mirror')}
              className="w-full h-12 bg-fuchsia-600 hover:bg-fuchsia-700 text-white border-fuchsia-500/40"
            >
              <FlipHorizontal className="h-5 w-5" />
              Reflect with Mirror
              {mirrorFirst && (
                <Badge
                  variant="secondary"
                  className="ml-1 bg-white/20 text-white border-white/20"
                >
                  Recommended
                </Badge>
              )}
            </Button>
          )}
          {prompt.hasShield && (
            <Button
              variant="default"
              size="lg"
              disabled={busy || auto}
              onClick={() => onResolve('shield')}
              className="w-full h-12 bg-slate-600 hover:bg-slate-700 text-white border-slate-500/40"
            >
              <Shield className="h-5 w-5" />
              Block with Shield
            </Button>
          )}
          <Button
            variant="outline"
            size="lg"
            disabled={busy || auto}
            onClick={() => onResolve('take')}
            className="w-full h-12 border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <Skull className="h-5 w-5" />
            Take the hit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main PlayerGame component
// ---------------------------------------------------------------------------

export default function PlayerGame() {
  const playerState = useGameStore((s) => s.playerState);
  const defensePrompt = useGameStore((s) => s.defensePrompt);
  const connected = useGameStore((s) => s.connected);
  const code = useGameStore((s) => s.code);
  const playerName = useGameStore((s) => s.playerName);
  const revealSquare = useGameStore((s) => s.revealSquare);
  const selectTarget = useGameStore((s) => s.selectTarget);
  const resolveDefense = useGameStore((s) => s.resolveDefense);
  const pushToast = useGameStore((s) => s.pushToast);
  const submitTally = useGameStore((s) => s.submitTally);
  const { play } = useSound();

  const [pendingTargetPower, setPendingTargetPower] = useState<PowerType | null>(
    null,
  );
  const [selectingTarget, setSelectingTarget] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [tallyGuess, setTallyGuess] = useState('');
  const [tallyChecking, setTallyChecking] = useState(false);
  const [tallyResult, setTallyResult] = useState<null | { verdict: 'correct' | 'wrong'; key: string }>(null);
  // Board reveal flash — toggles a brief gold sweep behind the board whenever
  // a square transitions from hidden → revealed on the player's own board.
  const [boardFlashKey, setBoardFlashKey] = useState(0);
  const prevRevealedCountRef = useRef<number | null>(null);
  const boardForFlash = playerState?.me.board;
  useEffect(() => {
    if (!boardForFlash) {
      prevRevealedCountRef.current = null;
      return;
    }
    const count = boardForFlash.reduce((n, s) => n + (s.revealed ? 1 : 0), 0);
    const prev = prevRevealedCountRef.current;
    prevRevealedCountRef.current = count;
    // Only flash when the count goes UP (a square was revealed on my board).
    // Reconnects (board replaced) or initial loads don't trigger it.
    if (prev !== null && count > prev) {
      setBoardFlashKey((k) => k + 1);
    }
  }, [boardForFlash]);

  const tallySnapshotKey = `${playerState?.me.stats.moneyFound ?? 0}:${playerState?.me.stats.cashSquaresFound ?? 0}`;

  const handleSubmitTally = useCallback(async () => {
    const guess = Number.parseInt(tallyGuess, 10);
    if (!Number.isFinite(guess) || guess < 0) {
      pushToast({ title: 'Enter a valid total', tone: 'bad' });
      return;
    }
    setTallyChecking(true);
    const result = await submitTally(guess);
    setTallyChecking(false);
    if (result.error) {
      pushToast({ title: result.error, tone: 'bad' });
      play('error');
      return;
    }
    if (result.correct) {
      setTallyResult({ verdict: 'correct', key: tallySnapshotKey });
      pushToast({ title: 'Correct tally', description: 'You added up the cash right.', tone: 'good' });
      play('win');
      return;
    }
    setTallyResult({ verdict: 'wrong', key: tallySnapshotKey });
    pushToast({ title: 'Not quite', description: 'Double-check the amounts you found.', tone: 'bad' });
    play('error');
  }, [play, pushToast, submitTally, tallyGuess, tallySnapshotKey]);

  // --- Build revealable coords set -----------------------------------------
  const board = playerState?.me.board;
  const calledCoordinates = playerState?.calledCoordinates ?? [];
  const currentCoord = playerState?.currentCoord;

  const revealableCoords = useMemo(() => {
    const set = new Set<string>();
    if (!board) return set;
    for (const coord of calledCoordinates) {
      const sq = board.find((s) => s.coord === coord);
      if (!sq || !sq.revealed) set.add(coord);
    }
    if (currentCoord) set.add(currentCoord);
    return set;
  }, [board, calledCoordinates, currentCoord]);

  // Is the current called coord still unrevealed on MY board?
  const currentCoordUnrevealed = useMemo(() => {
    if (!board || !currentCoord) return false;
    const sq = board.find((s) => s.coord === currentCoord);
    return !sq?.revealed;
  }, [board, currentCoord]);

  // --- Square click handler -------------------------------------------------
  const onSquareClick = useCallback(
    async (coord: string) => {
      // Read the square content BEFORE revealing — content is static, only
      // `revealed` flips. Reading after the ack would race with the state
      // broadcast (ack arrives before the state update).
      const sq = board?.find((s) => s.coord === coord);
      const targetingPower =
        sq?.content.kind === 'power' && POWERS[sq.content.power].targeting
          ? sq.content.power
          : null;

      const r = await revealSquare(coord);
      if (r.error) {
        pushToast({ title: r.error, tone: 'bad' });
        play('error');
        return;
      }
      play('reveal');
      if (targetingPower) {
        setPendingTargetPower(targetingPower);
      }
    },
    [board, revealSquare, pushToast, play],
  );

  // --- Select target action -------------------------------------------------
  const handleSelectTarget = useCallback(
    async (targetId: string, targetName: string) => {
      if (!pendingTargetPower) return;
      setSelectingTarget(true);
      const r = await selectTarget(pendingTargetPower, targetId);
      setSelectingTarget(false);
      if (r.error) {
        pushToast({ title: r.error, tone: 'bad' });
        play('error');
      } else if (r.pending) {
        pushToast({
          title: `Waiting for ${targetName}'s defense…`,
          description: 'Your attack is in flight!',
          tone: 'info',
        });
      } else if (r.resolved) {
        pushToast({
          title: `${POWERS[pendingTargetPower].label} used!`,
          description: `Targeted ${targetName}`,
          tone: 'good',
        });
      }
      setPendingTargetPower(null);
    },
    [pendingTargetPower, selectTarget, pushToast, play],
  );

  // --- Resolve defense action -----------------------------------------------
  const handleResolveDefense = useCallback(
    async (choice: DefenseChoice) => {
      if (!defensePrompt) return;
      setResolving(true);
      const r = await resolveDefense(defensePrompt.promptId, choice);
      setResolving(false);
      if (r.error) {
        pushToast({ title: r.error, tone: 'bad' });
        play('error');
      }
    },
    [defensePrompt, resolveDefense, pushToast, play],
  );

  if (!playerState) {
    return (
      <div className="min-h-[calc(100vh-3rem)] flex items-center justify-center p-8 text-center text-muted-foreground">
        Loading your game…
      </div>
    );
  }

  const me = playerState.me;
  const rivals = playerState.rivals;
  const status = playerState.status;
  const locked = playerState.locked;
  const boardDisabled = status !== 'playing' || locked;
  const recentHistory = me.history.slice(0, 10); // engine unshifts — newest first
  const tallyResultState = tallyResult?.key === tallySnapshotKey ? tallyResult.verdict : null;

  return (
    <div className="min-h-[calc(100vh-3rem)] flex flex-col gap-4 p-3 sm:p-4 max-w-7xl mx-auto w-full">
      {/* --- Top bar (sticky) --- */}
      <header className="sticky top-0 z-30 -mx-3 sm:-mx-4 px-3 sm:px-4 py-2.5 bg-background/85 backdrop-blur-md border-b border-border/60">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Badge
              variant="secondary"
              className="font-mono text-base font-bold tracking-wider"
              aria-label={`Game code ${code}`}
            >
              {code}
            </Badge>
            <span
              className={cn(
                'flex items-center gap-1 text-xs px-2 py-1 rounded-md',
                connected
                  ? 'text-emerald-500 bg-emerald-500/10'
                  : 'text-destructive bg-destructive/10',
              )}
              role="status"
            >
              {connected ? (
                <Wifi className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              <span className="hidden sm:inline">
                {connected ? 'Live' : 'Offline'}
              </span>
            </span>
            {locked && (
              <Badge
                variant="outline"
                className="text-amber-500 border-amber-500/40 bg-amber-500/10"
              >
                <Lock className="h-3 w-3" /> Locked by host
              </Badge>
            )}
            <RoundTimerIndicator timer={playerState.roundTimer} />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <span className="truncate">
              Captain{' '}
              <span className="text-foreground font-semibold">{playerName}</span>
            </span>
            <span aria-hidden>•</span>
            <span className="truncate">
              Host{' '}
              <span className="text-foreground font-semibold">
                {playerState.hostName}
              </span>
            </span>
          </div>
        </div>

        {/* Current called coordinate — big, gold, pulsing if pending */}
        <AnimatePresence mode="wait">
          {currentCoord && (
            <motion.div
              key={currentCoord + (currentCoordUnrevealed ? '-pending' : '-done')}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="mt-2 flex items-center justify-center gap-2 sm:gap-3"
            >
              {currentCoordUnrevealed && (
                <MapPin
                  className="h-5 w-5 sm:h-6 sm:w-6 text-gold pin-bounce"
                  aria-hidden
                />
              )}
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Now calling
              </span>
              <span
                className={cn(
                  'font-display text-3xl sm:text-4xl font-bold gold-text',
                  currentCoordUnrevealed && 'coord-dramatic animate-pulse-ring rounded-md px-2',
                )}
                aria-live="polite"
              >
                {currentCoord}
              </span>
              {currentCoordUnrevealed ? (
                <span className="text-xs text-gold/80 font-medium animate-pulse">
                  Tap to reveal!
                </span>
              ) : (
                <span className="text-xs text-emerald-500 font-medium">
                  Revealed ✓
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* --- Paused banner --- */}
      <AnimatePresence>
        {status === 'paused' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-center gap-3"
            role="status"
          >
            <Pause className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-amber-500">
                Game paused by host
              </div>
              <div className="text-xs text-muted-foreground">
                Hang tight — the game will resume shortly.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Money summary (3 pills) --- */}
      <section
        aria-label="Money summary"
        className="grid grid-cols-3 gap-2 sm:gap-3"
      >
        <MoneyStat
          label="Cash Finds"
          value={me.stats.cashSquaresFound}
          tone="gold"
          icon={<Coins className="h-3 w-3" />}
          hint="Add the amounts yourself"
          variant="at-risk"
          format="count"
        />
        <MoneyStat
          label="Banked"
          value={me.bankedTotal}
          tone="ocean"
          icon={<Landmark className="h-3 w-3" />}
          hint="Safe forever"
          variant="banked"
        />
        <div className="rounded-xl border border-border bg-card/60 p-3 sm:p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide opacity-80">
            <Trophy className="h-3 w-3 text-gold" />
            <span className="truncate">Check Tally</span>
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="Your total"
              value={tallyGuess}
              onChange={(e) => setTallyGuess(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmitTally();
              }}
              className="h-10"
            />
            <Button
              type="button"
              size="sm"
              className="h-10 shrink-0 btn-pirate"
              onClick={() => void handleSubmitTally()}
              disabled={tallyChecking}
            >
              {tallyChecking ? 'Checking…' : 'Check'}
            </Button>
          </div>
          <div
            className={cn(
              'text-[10px] font-medium',
              tallyResultState === 'correct'
                ? 'text-emerald-500'
                : tallyResultState === 'wrong'
                  ? 'text-red-500'
                  : 'text-muted-foreground',
            )}
          >
            {tallyResultState === 'correct'
              ? 'That tally is correct.'
              : tallyResultState === 'wrong'
                ? 'That tally is off.'
                : 'Enter the total of the cash you found.'}
          </div>
        </div>
      </section>

      {/* --- Main grid: board+inventory left, activity+rivals right --- */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-4 flex-1">
        {/* Left column */}
        <div className="flex flex-col gap-4 min-w-0">
          {/* The board */}
          <section
            aria-label="Your treasure board"
            className="pirate-card p-4 sm:p-6 relative"
          >
            {/* Reveal flash — gold sweep outward, fired whenever a square
                transitions hidden → revealed on my board. Re-keyed span so
                the CSS animation re-runs each reveal. */}
            {boardFlashKey > 0 && (
              <span
                key={boardFlashKey}
                className="board-reveal-flash pointer-events-none absolute inset-0 rounded-xl"
                aria-hidden
              />
            )}
            {currentCoord && currentCoordUnrevealed ? (
              <div className="mb-3 text-center text-sm text-gold/90 font-medium animate-pulse flex items-center justify-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Tap {currentCoord} to reveal!
              </div>
            ) : !currentCoord ? (
              <div className="mb-3 text-center text-sm text-muted-foreground flex items-center justify-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-gold/70 pin-bounce" />
                Waiting for the captain to call a coordinate…
              </div>
            ) : null}
            <GameBoard
              board={me.board}
              size="lg"
              highlightCoord={currentCoord}
              revealableCoords={revealableCoords}
              onSquareClick={onSquareClick}
              disabled={boardDisabled}
            />
            {boardDisabled && status === 'playing' && locked && (
              <div className="mt-3 text-center text-xs text-amber-500/80">
                Board locked by host — wait for unlock.
              </div>
            )}
            {status === 'ended' && (
              <div className="mt-3 text-center text-xs text-muted-foreground">
                Game ended — calculating results…
              </div>
            )}
          </section>

          {/* Inventory */}
          <section
            aria-label="Defensive inventory"
            className="pirate-panel p-4 sm:p-6"
          >
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Defensive Items</h2>
              <Badge variant="secondary" className="ml-auto">
                {me.inventory.length}
              </Badge>
            </div>
            {me.inventory.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-4 flex flex-col items-center gap-2">
                <PackageOpen className="h-8 w-8 opacity-40" />
                <span>No defensive items yet — find Shield/Mirror squares.</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {me.inventory.map((item, idx) => {
                  const meta = POWERS[item.type];
                  return (
                    <div
                      key={`${item.type}-${idx}`}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium inventory-chip',
                        powerChipClass(item.type),
                      )}
                      title={meta.description}
                      style={{ animationDelay: `${(idx % 6) * 0.4}s` }}
                    >
                      <PowerIcon power={item.type} />
                      <span className={powerTextClass(item.type)}>
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4 min-w-0">
          {/* Rivals strip */}
          <section aria-label="Rivals" className="pirate-panel p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Rivals</h2>
              <Badge variant="secondary" className="ml-auto">
                {rivals.length}
              </Badge>
            </div>
            {rivals.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-3">
                You&apos;re the only player. Invite friends!
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto scroll-thin pb-2 -mx-1 px-1">
                {rivals.map((r) => (
                  <div
                    key={r.id}
                    className="shrink-0 w-32 rounded-lg border border-border/70 bg-card/60 p-2.5 flex flex-col gap-1"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <StatusDot connected={r.connected} />
                      <span className="text-xs font-semibold truncate">
                        {r.name}
                      </span>
                      {r.isHost && (
                        <Crown className="h-3 w-3 text-gold shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span title="Running total" className="font-mono">
                        {formatMoney(r.runningTotal)}
                      </span>
                      <span title="Banked" className="text-ocean font-mono">
                        {formatMoney(r.bankedTotal)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Shield className="h-3 w-3" />
                      <span>
                        {r.inventoryCount}{' '}
                        {r.inventoryCount === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Activity log */}
          <section
            aria-label="Your activity log"
            className="pirate-panel parchment-scroll p-4 flex-1 min-h-0 flex flex-col"
          >
            <div className="flex items-center gap-2 mb-3">
              <History className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Your Activity</h2>
            </div>
            <div className="max-h-64 overflow-y-auto scroll-thin -mx-1 px-1 flex flex-col gap-1.5">
              {recentHistory.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-3">
                  No moves yet. Tap a called coordinate to start your treasure
                  hunt!
                </div>
              ) : (
                recentHistory.map((entry, idx) => {
                  const meta = HISTORY_KIND_META[entry.kind];
                  const Icon = meta.icon;
                  return (
                    <article
                      key={`${entry.at}-${idx}`}
                      className={cn(
                        'flex items-start gap-2 rounded-md border border-border/40 border-l-[3px] bg-card/40 px-2 py-1.5 text-xs',
                        meta.border,
                        idx === 0 && 'activity-row-new border-l-gold',
                      )}
                    >
                      <div
                        className={cn(
                          'mt-0.5 rounded p-1 shrink-0',
                          meta.bg,
                        )}
                      >
                        <Icon className={cn('h-3 w-3', meta.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-foreground break-words">
                          {entry.coord && (
                            <span className="font-mono font-bold text-gold mr-1">
                              {entry.coord}
                            </span>
                          )}
                          {entry.text}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatClock(entry.at)}
                        </div>
                      </div>
                      {typeof entry.delta === 'number' && entry.delta !== 0 && (
                        <span
                          className={cn(
                            'font-mono font-semibold tabular-nums shrink-0',
                            entry.delta > 0
                              ? 'text-emerald-500'
                              : 'text-red-500',
                          )}
                        >
                          {entry.delta > 0 ? '+' : ''}
                          {formatMoney(entry.delta)}
                        </span>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>

      {/* --- Target Selection Modal --- */}
      <TargetSelectionModal
        open={!!pendingTargetPower}
        power={pendingTargetPower}
        rivals={rivals}
        busy={selectingTarget}
        onSelect={handleSelectTarget}
        onClose={() => !selectingTarget && setPendingTargetPower(null)}
      />

      {/* --- Defense Modal --- */}
      <DefenseModal
        prompt={defensePrompt}
        busy={resolving}
        onResolve={handleResolveDefense}
      />

      {/* --- Quick reactions (floating emoji palette) --- */}
      <EmoteBar />
      </div>
  );
}
