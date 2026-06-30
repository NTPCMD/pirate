'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Anchor,
  CloudRain,
  Coins,
  Crown,
  Download,
  Gem,
  Gift,
  Hourglass,
  Info,
  Landmark,
  Layers,
  LogOut,
  RotateCw,
  Shield,
  Skull,
  Sparkles,
  Target,
  Trophy,
  FlipHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { useGameStore } from '@/hooks/pirate/useGameStore';
import { useSound } from '@/components/pirate/SoundManager';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatMoney, type AwardResult } from '@/lib/pirate/types';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Award icon + color lookups
// ---------------------------------------------------------------------------

const AWARD_ICON_MAP: Record<string, LucideIcon> = {
  Coins,
  Anchor,
  Gift,
  CloudRain,
  Layers,
  Landmark,
  Gem,
  Target,
  Shield,
  FlipHorizontal,
};

const AWARD_COLOR: Record<string, { text: string; bg: string; ring: string }> = {
  mostMoneyFound: { text: 'text-amber-400', bg: 'bg-amber-500/15', ring: 'border-amber-500/40' },
  mostMoneyStolen: { text: 'text-sky-400', bg: 'bg-sky-500/15', ring: 'border-sky-500/40' },
  mostGenerous: { text: 'text-emerald-400', bg: 'bg-emerald-500/15', ring: 'border-emerald-500/40' },
  mostUnlucky: { text: 'text-slate-400', bg: 'bg-slate-500/15', ring: 'border-slate-500/40' },
  biggestMultiplier: { text: 'text-rose-400', bg: 'bg-rose-500/15', ring: 'border-rose-500/40' },
  biggestBank: { text: 'text-yellow-400', bg: 'bg-yellow-500/15', ring: 'border-yellow-500/40' },
  biggestSingleFind: { text: 'text-amber-400', bg: 'bg-amber-500/15', ring: 'border-amber-500/40' },
  mostAttacked: { text: 'text-red-400', bg: 'bg-red-500/15', ring: 'border-red-500/40' },
  mostShieldsUsed: { text: 'text-slate-300', bg: 'bg-slate-500/15', ring: 'border-slate-500/40' },
  mostMirrorsUsed: { text: 'text-fuchsia-400', bg: 'bg-fuchsia-500/15', ring: 'border-fuchsia-500/40' },
};

const DEFAULT_AWARD_COLOR = {
  text: 'text-gold',
  bg: 'bg-gold/15',
  ring: 'border-gold/40',
};

const MONEY_CATEGORIES = new Set<string>([
  'mostMoneyFound',
  'mostMoneyStolen',
  'mostGenerous',
  'mostUnlucky',
  'biggestMultiplier',
  'biggestBank',
  'biggestSingleFind',
]);

function getAwardColor(category: string) {
  return AWARD_COLOR[category] ?? DEFAULT_AWARD_COLOR;
}

function getAwardIcon(iconName: string): LucideIcon {
  return AWARD_ICON_MAP[iconName] ?? Trophy;
}

function formatAwardValue(award: AwardResult): string {
  if (award.value === undefined || award.value === null) return '—';
  if (typeof award.value === 'string') return award.value;
  if (MONEY_CATEGORIES.has(award.category)) return formatMoney(award.value);
  return String(award.value);
}

// ---------------------------------------------------------------------------
// Podium geometry
// ---------------------------------------------------------------------------

const PODIUM_HEIGHT: Record<number, string> = {
  1: 'h-40 sm:h-52',
  2: 'h-28 sm:h-36',
  3: 'h-20 sm:h-28',
};

// Staggered rise delays — 1st rises last for drama
const PODIUM_DELAY: Record<number, number> = { 2: 0, 3: 180, 1: 360 };

// CSS-only continuous confetti pieces for the podium backdrop. Pirate palette:
// gold / amber / ocean / rust / parchment cream. Falls slowly with random
// rotation. Honors prefers-reduced-motion (animation disabled globally).
interface ConfettiPiece {
  left: number; // % horizontal position
  width: number;
  height: number;
  color: string;
  duration: number; // s
  delay: number; // s
  rotate: number; // deg
  round: boolean;
}
const CONFETTI_COLORS = ['#f5c542', '#f0a830', '#e67e22', '#1abc9c', '#fde68a', '#cd7f32'];
const CONFETTI_PIECES: ConfettiPiece[] = Array.from({ length: 40 }, (_, i) => {
  const seed = (i * 37) % 100;
  return {
    left: (i * 7 + 5) % 100,
    width: 6 + ((seed * 13) % 5),
    height: 10 + ((seed * 7) % 8),
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    duration: 3.4 + ((seed * 11) % 30) / 10, // 3.4s – 6.4s
    delay: ((seed * 17) % 60) / 10, // 0s – 6s
    rotate: (seed * 9) % 360,
    round: i % 5 === 0,
  };
});

function fireCelebrationConfetti() {
  const colors = ['#f5c542', '#f0a830', '#e67e22', '#1abc9c', '#fde68a'];
  confetti({
    particleCount: 120,
    spread: 90,
    origin: { y: 0.55 },
    colors,
    scalar: 1.1,
  });
  setTimeout(() => {
    confetti({ particleCount: 60, angle: 60, spread: 70, origin: { x: 0, y: 0.65 }, colors });
    confetti({ particleCount: 60, angle: 120, spread: 70, origin: { x: 1, y: 0.65 }, colors });
  }, 220);
  setTimeout(() => {
    confetti({ particleCount: 50, spread: 100, startVelocity: 45, origin: { y: 0.5 }, colors });
  }, 600);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EndGameResults({ role }: { role: 'host' | 'player' | 'spectator' }) {
  const results = useGameStore((s) => s.results);
  const reset = useGameStore((s) => s.reset);
  const resetGame = useGameStore((s) => s.resetGame);
  const hostExport = useGameStore((s) => s.hostExport);
  const pushToast = useGameStore((s) => s.pushToast);
  const { play } = useSound();
  const firedRef = useRef(false);

  // Fire confetti + triumphant win sound once on mount
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const t = setTimeout(() => {
      fireCelebrationConfetti();
      play('win');
    }, 250);
    return () => clearTimeout(t);
  }, [play]);

  // Loading state — results not yet available
  if (!results) {
    return (
      <div className="min-h-[calc(100vh-3rem)] flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
          <div className="h-10 w-10 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
          <p className="text-sm text-muted-foreground display-font">Tallying the loot…</p>
        </div>
      </div>
    );
  }

  const { code, endedAt, ranking, awards } = results;

  // Empty ranking — no one finished
  if (!ranking || ranking.length === 0) {
    return (
      <div className="min-h-[calc(100vh-3rem)] flex items-center justify-center p-6">
        <div className="pirate-card p-8 text-center max-w-md">
          <Skull className="h-12 w-12 text-rust mx-auto mb-3" aria-hidden />
          <h2 className="display-font text-2xl gold-text mb-2">No Survivors</h2>
          <p className="text-sm text-muted-foreground mb-6">
            No players finished the game. The seas be empty.
          </p>
          <Button onClick={reset} size="lg" className="min-h-11 bg-gold text-gold-foreground hover:bg-gold/90 btn-pirate">
            <RotateCw className="h-4 w-4" />
            {role === 'host' ? 'New Game' : 'Play Again'}
          </Button>
        </div>
      </div>
    );
  }

  const winner = ranking.find((r) => r.rank === 1);
  const endedTime = new Date(endedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Podium visual ordering: left=2nd, center=1st, right=3rd
  const podiumRanks = [2, 1, 3];
  const podiumEntries = podiumRanks.map((rank) => ({
    rank,
    entry: ranking.find((r) => r.rank === rank),
  }));

  async function handleExport() {
    try {
      const data = await hostExport();
      if (!data || data.error) {
        pushToast({
          title: 'Export failed',
          description: data?.error ?? 'Could not export results.',
          tone: 'bad',
          animation: 'shake',
        });
        return;
      }
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pirate-game-${code}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      pushToast({
        title: 'Results exported!',
        description: 'Your treasure log has been downloaded.',
        tone: 'good',
        animation: 'confetti',
      });
    } catch {
      pushToast({
        title: 'Export failed',
        description: 'An unexpected error occurred.',
        tone: 'bad',
        animation: 'shake',
      });
    }
  }

  return (
    <section aria-label="Game results" className="min-h-[calc(100vh-3rem)] p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-6 sm:space-y-8">
        {/* === 1. Winner hero + Podium === */}
        <header className="text-center space-y-2 pt-2">
          <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-gold">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            <span className="font-mono tracking-wider">GAME {code}</span>
            <span className="opacity-60" aria-hidden>·</span>
            <span>Ended at {endedTime}</span>
          </div>
          <h1 className="display-font text-4xl sm:text-5xl md:text-6xl gold-text leading-tight">
            {winner ? `${winner.name} wins!` : 'Game Over'}
          </h1>
          {winner ? (
            <p className="text-sm sm:text-base text-muted-foreground">
              With a final haul of{' '}
              <span className="font-mono font-semibold text-gold">
                {formatMoney(winner.finalScore)}
              </span>
            </p>
          ) : (
            <p className="text-sm sm:text-base text-muted-foreground">
              The voyage has come to an end.
            </p>
          )}
        </header>

        <div
          className="relative flex items-end justify-center gap-2 sm:gap-4 md:gap-6 px-2 overflow-hidden"
          aria-label="Podium — top three players"
          role="group"
        >
          {/* Background confetti — CSS-only continuous fall behind the podium */}
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
            {CONFETTI_PIECES.map((c, i) => (
              <span
                key={i}
                className="confetti-piece"
                style={{
                  left: `${c.left}%`,
                  background: c.color,
                  animationDuration: `${c.duration}s`,
                  animationDelay: `${c.delay}s`,
                  transform: `translateY(0) rotateZ(${c.rotate}deg)`,
                  width: `${c.width}px`,
                  height: `${c.height}px`,
                  borderRadius: c.round ? '999px' : '2px',
                }}
              />
            ))}
          </div>

          {podiumEntries.map(({ rank, entry }) => {
            const delay = PODIUM_DELAY[rank] ?? 0;
            const isFirst = rank === 1;
            const isSecond = rank === 2;
            const isEmpty = !entry;
            const heightClass = PODIUM_HEIGHT[rank] ?? 'h-24';
            const podiumSurface = isFirst
              ? 'bg-gradient-to-b from-gold/45 to-gold/10 border-gold/60'
              : isSecond
                ? 'bg-gradient-to-b from-slate-400/30 to-slate-500/10 border-slate-400/40'
                : 'bg-gradient-to-b from-rust/30 to-rust/5 border-rust/40';
            const metallicLabelClass = isFirst
              ? 'label-gold-metal'
              : isSecond
                ? 'label-silver-metal'
                : 'label-bronze-metal';
            return (
              <div
                key={rank}
                className={cn(
                  'flex-1 max-w-[180px] flex flex-col items-center relative z-[1]',
                  isFirst && 'order-2 podium-spotlight',
                  rank === 2 && 'order-1',
                  rank === 3 && 'order-3',
                )}
              >
                {/* Crown floating above 1st place */}
                {isFirst && !isEmpty && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, rotate: -15 }}
                    animate={{ opacity: 1, y: 0, rotate: 0 }}
                    transition={{ delay: 1, type: 'spring', stiffness: 280, damping: 18 }}
                    className="mb-2 crown-glow"
                    aria-hidden
                  >
                    <Crown className="h-7 w-7 sm:h-9 sm:w-9" />
                  </motion.div>
                )}

                {/* Name + score bubble above podium */}
                <div className="mb-2 text-center min-h-[3rem] px-1">
                  {isEmpty ? (
                    <span className="text-muted-foreground/50 text-2xl font-bold">—</span>
                  ) : (
                    <>
                      <div className="text-xs sm:text-sm font-semibold truncate max-w-[150px] flex items-center justify-center gap-1.5">
                        <span className="truncate">{entry!.name}</span>
                        {entry!.isHost && (
                          <Badge variant="secondary" className="text-[9px] py-0 px-1">
                            Host
                          </Badge>
                        )}
                      </div>
                      <div className="text-base sm:text-lg font-mono font-bold gold-text-strong">
                        {formatMoney(entry!.finalScore)}
                      </div>
                    </>
                  )}
                </div>

                {/* Podium block */}
                <div
                  className={cn(
                    'animate-podium-rise w-full rounded-t-xl border-t border-x flex flex-col items-center justify-end pb-3 pt-2',
                    podiumSurface,
                    heightClass,
                  )}
                  style={{ animationDelay: `${delay}ms`, opacity: 0 }}
                >
                  <span
                    className={cn(
                      'display-font text-3xl sm:text-4xl font-bold',
                      isFirst ? 'gold-text-strong' : 'text-foreground/80',
                    )}
                  >
                    {rank}
                  </span>
                  {/* Metallic 1ST / 2ND / 3RD label */}
                  <span
                    className={cn(
                      'text-[10px] sm:text-xs uppercase tracking-[0.18em] mt-0.5',
                      metallicLabelClass,
                    )}
                  >
                    {isFirst ? '1ST' : isSecond ? '2ND' : '3RD'}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    {isFirst ? 'Champion' : rank === 2 ? 'Runner-up' : 'Third'}
                  </span>
                </div>

                {/* Pulsing gold ring around 1st place "avatar" zone */}
                {isFirst && !isEmpty && (
                  <span
                    className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-9 w-9 sm:h-11 sm:w-11 rounded-full pulse-gold-ring"
                    aria-hidden
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* === 2. Full ranking table === */}
        <section aria-label="Full standings" className="pirate-card p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-4 w-4 text-gold" aria-hidden />
            <h2 className="display-font text-xl sm:text-2xl">Final Standings</h2>
          </div>
          {/* column header (desktop only) */}
          <div className="hidden sm:grid grid-cols-[2rem_1fr_5rem_5rem_6rem] gap-3 px-3 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
            <div className="text-center">#</div>
            <div>Pirate</div>
            <div className="text-right">Banked</div>
            <div className="text-right">Running</div>
            <div className="text-right">Final</div>
          </div>
          <div className="mt-2 space-y-1.5 max-h-96 overflow-y-auto scroll-thin pr-1" role="list">
            {ranking.map((row, i) => {
              const isTop3 = row.rank <= 3;
              const rowTone = isTop3
                ? row.rank === 1
                  ? 'border-gold/50 bg-gold/10'
                  : row.rank === 2
                    ? 'border-slate-400/40 bg-slate-400/10'
                    : 'border-rust/40 bg-rust/10'
                : 'border-border/60 bg-card/40';
              return (
                <motion.div
                  key={row.playerId}
                  role="listitem"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.06, duration: 0.35 }}
                  className={cn(
                    'grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_1fr_5rem_5rem_6rem] gap-2 sm:gap-3 items-center rounded-lg border px-3 py-2',
                    rowTone,
                  )}
                >
                  <div className="text-center font-mono font-bold text-sm sm:text-base">
                    {row.rank}
                  </div>
                  <div className="min-w-0 flex items-center gap-1.5">
                    <span className="truncate font-medium text-sm sm:text-base">{row.name}</span>
                    {row.isHost && (
                      <Badge variant="secondary" className="text-[9px] py-0 px-1">
                        Host
                      </Badge>
                    )}
                  </div>
                  {/* Mobile: compact combined cell */}
                  <div className="sm:hidden flex items-center justify-end gap-2 text-xs">
                    <span className="text-muted-foreground">
                      B <span className="font-mono">{formatMoney(row.banked)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      R <span className="font-mono">{formatMoney(row.running)}</span>
                    </span>
                    <span className="font-mono font-bold gold-text">{formatMoney(row.finalScore)}</span>
                  </div>
                  <div className="hidden sm:block text-right font-mono text-sm tabular-nums">
                    {formatMoney(row.banked)}
                  </div>
                  <div className="hidden sm:block text-right font-mono text-sm tabular-nums">
                    {formatMoney(row.running)}
                  </div>
                  <div className="hidden sm:block text-right font-mono text-sm tabular-nums font-bold">
                    {formatMoney(row.finalScore)}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* === 3. Awards grid === */}
        {awards && awards.length > 0 && (
          <section aria-label="Pirate awards" className="pirate-card p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-gold" aria-hidden />
              <h2 className="display-font text-xl sm:text-2xl">Pirate Awards</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {awards.map((award, i) => {
                const Icon = getAwardIcon(award.icon);
                const color = getAwardColor(award.category);
                return (
                  <motion.article
                    key={`${award.category}-${i}`}
                    initial={{ opacity: 0, y: 16, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      delay: 0.7 + i * 0.08,
                      type: 'spring',
                      stiffness: 240,
                      damping: 22,
                    }}
                    className={cn(
                      'relative overflow-hidden rounded-xl border p-3 sm:p-4 flex flex-col items-center text-center gap-2',
                      color.bg,
                      color.ring,
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border bg-card/70',
                        color.ring,
                      )}
                    >
                      <Icon className={cn('h-5 w-5 sm:h-6 sm:w-6', color.text)} aria-hidden />
                    </div>
                    <div className="min-w-0 w-full">
                      <div className="text-xs sm:text-sm font-semibold leading-tight">
                        {award.label}
                      </div>
                      {award.playerName && (
                        <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">
                          {award.playerName}
                        </div>
                      )}
                    </div>
                    <div className={cn('font-mono font-bold text-sm sm:text-base', color.text)}>
                      {formatAwardValue(award)}
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </section>
        )}

        {/* === 4. Actions / sign-off === */}
        <section
          aria-label="End of game actions"
          className="pirate-card p-4 sm:p-6 flex flex-col items-center gap-4"
        >
          <p className="text-sm sm:text-base text-center text-muted-foreground display-font max-w-md">
            {role === 'host'
              ? 'Thanks for hosting, Captain! May your next voyage be rich with plunder.'
              : role === 'spectator'
                ? 'Thanks for watching, matey! Fair winds and following seas.'
                : 'Thanks for playing, matey! Fair winds and following seas.'}
          </p>

          {role === 'host' ? (
            <>
              {/* Primary CTA — Play Again keeps the crew together */}
              <div className="flex flex-col items-center gap-2 w-full">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => {
                        play('click');
                        resetGame();
                        pushToast({
                          title: 'New game ready!',
                          description: 'Same crew, fresh boards. Setting sail again.',
                          tone: 'good',
                          animation: 'confetti',
                        });
                      }}
                      size="lg"
                      className="min-h-12 px-6 text-base bg-gold text-gold-foreground hover:bg-gold/90 btn-pirate shadow-lg shadow-gold/30 ring-2 ring-gold/40"
                      aria-label="Start a fresh game with the same players and new boards"
                    >
                      <RotateCw className="h-5 w-5" />
                      Play Again
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-center">
                    Start a fresh game — everyone keeps their name and gets a new board.
                  </TooltipContent>
                </Tooltip>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3 w-3 text-gold" aria-hidden />
                  Same crew, new boards — scores reset to zero.
                </p>
              </div>

              {/* Secondary actions — Export + leave-and-start-over */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  onClick={handleExport}
                  size="lg"
                  variant="outline"
                  className="min-h-11 btn-pirate"
                  aria-label="Export results as a JSON file"
                >
                  <Download className="h-4 w-4" />
                  Export Results
                </Button>
                <Button
                  onClick={() => {
                    play('click');
                    reset();
                  }}
                  size="lg"
                  variant="ghost"
                  className="min-h-11 btn-pirate text-muted-foreground hover:text-foreground"
                  aria-label="Leave this game and start a brand new one"
                >
                  <LogOut className="h-4 w-4" />
                  New Game
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 w-full">
              {/* Waiting state — only the host can reset */}
              <div
                className="flex items-center gap-2.5 rounded-lg border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-center"
                role="status"
                aria-live="polite"
              >
                <Hourglass className="h-4 w-4 text-gold animate-pulse" aria-hidden />
                <span className="text-foreground/90">
                  {role === 'spectator'
                    ? 'Waiting for the host to start a new game…'
                    : 'Waiting for the host to start a new game…'}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  onClick={() => {
                    play('click');
                    reset();
                  }}
                  size="lg"
                  variant="ghost"
                  className="min-h-11 btn-pirate text-muted-foreground hover:text-foreground"
                  aria-label={
                    role === 'spectator'
                      ? 'Leave the spectator session'
                      : 'Leave the game'
                  }
                >
                  <LogOut className="h-4 w-4" />
                  Leave
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
