'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AnimatedNumber } from '@/components/pirate/AnimatedNumber';
import {
  Anchor,
  ArrowLeftRight,
  Flame,
  Gift,
  Ship,
  Landmark,
  Lock,
  ChevronsUp,
  TrendingUp,
  Shield,
  FlipHorizontal,
  Coins,
  type LucideIcon,
} from 'lucide-react';
import {
  BOARD_SIZE,
  COLUMNS,
  POWERS,
  type Board as BoardType,
  type PowerType,
  type Square,
  indexToCoord,
} from '@/lib/pirate/types';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Power icon mapping
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  Anchor,
  ArrowLeftRight,
  Flame,
  Gift,
  Ship,
  Landmark,
  ChevronsUp,
  TrendingUp,
  Shield,
  FlipHorizontal,
};

const POWER_COLOR_CLASS: Record<string, string> = {
  amber: 'text-amber-500',
  sky: 'text-sky-500',
  violet: 'text-violet-500',
  red: 'text-red-500',
  emerald: 'text-emerald-500',
  cyan: 'text-cyan-500',
  yellow: 'text-yellow-500',
  orange: 'text-orange-500',
  rose: 'text-rose-500',
  slate: 'text-slate-400',
  fuchsia: 'text-fuchsia-500',
};

const POWER_BG_CLASS: Record<string, string> = {
  amber: 'bg-amber-500/15 border-amber-500/40',
  sky: 'bg-sky-500/15 border-sky-500/40',
  violet: 'bg-violet-500/15 border-violet-500/40',
  red: 'bg-red-500/15 border-red-500/40',
  emerald: 'bg-emerald-500/15 border-emerald-500/40',
  cyan: 'bg-cyan-500/15 border-cyan-500/40',
  yellow: 'bg-yellow-500/15 border-yellow-500/40',
  orange: 'bg-orange-500/15 border-orange-500/40',
  rose: 'bg-rose-500/15 border-rose-500/40',
  slate: 'bg-slate-500/15 border-slate-500/40',
  fuchsia: 'bg-fuchsia-500/15 border-fuchsia-500/40',
};

/**
 * Classifies a power into an aura category for board-square glow effects:
 *  - negative: aggressive powers (anchor/fire/swap/shipSinks) — red menace pulse
 *  - defensive: protective powers (shield/mirror) — ocean ward pulse
 *  - epic: high-value powers (x2/x3/bank/gift) — gold epic pulse
 */
function powerAuraClass(power: PowerType): string {
  switch (power) {
    case 'anchor':
    case 'fire':
    case 'swap':
    case 'shipSinks':
      return 'power-aura-negative';
    case 'shield':
    case 'mirror':
      return 'power-aura-defensive';
    case 'bank':
    case 'x2':
    case 'x3':
    case 'gift':
      return 'power-aura-epic';
    default:
      return '';
  }
}

export function PowerIcon({
  power,
  className,
}: {
  power: PowerType;
  className?: string;
}) {
  const meta = POWERS[power];
  const Icon = ICON_MAP[meta.icon] ?? Coins;
  return <Icon className={cn('h-4 w-4', POWER_COLOR_CLASS[meta.color], className)} />;
}

export function powerChipClass(power: PowerType): string {
  return POWER_BG_CLASS[POWERS[power].color] ?? 'bg-muted border-border';
}

export function powerTextClass(power: PowerType): string {
  return POWER_COLOR_CLASS[POWERS[power].color] ?? 'text-foreground';
}

// ---------------------------------------------------------------------------
// Cash value rendering
// ---------------------------------------------------------------------------

export function cashColorClass(value: number): string {
  if (value >= 500) return 'text-amber-300';
  if (value >= 100) return 'text-amber-400';
  if (value >= 50) return 'text-emerald-400';
  if (value >= 20) return 'text-sky-400';
  return 'text-foreground/80';
}

export function cashBgClass(value: number): string {
  if (value >= 500) return 'bg-amber-500/20 border-amber-400/50';
  if (value >= 100) return 'bg-amber-500/15 border-amber-500/40';
  if (value >= 50) return 'bg-emerald-500/15 border-emerald-500/40';
  if (value >= 20) return 'bg-sky-500/15 border-sky-500/40';
  return 'bg-muted/60 border-border';
}

// ---------------------------------------------------------------------------
// Board component
// ---------------------------------------------------------------------------

interface BoardProps {
  board: BoardType;
  onSquareClick?: (coord: string) => void;
  highlightCoord?: string;
  revealableCoords?: Set<string>; // coords the player may tap to reveal (current called coord)
  showAll?: boolean; // host inspect: show contents of unrevealed squares
  size?: 'mini' | 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
}

const SIZE_CLASS: Record<NonNullable<BoardProps['size']>, string> = {
  mini: 'gap-0.5',
  sm: 'gap-1',
  md: 'gap-1.5',
  lg: 'gap-1.5 sm:gap-2',
};

const CELL_CLASS: Record<NonNullable<BoardProps['size']>, string> = {
  mini: 'h-5 text-[8px] rounded-[3px]',
  sm: 'h-7 text-[10px] rounded-md',
  md: 'h-9 text-xs rounded-md',
  lg: 'h-9 sm:h-11 text-xs sm:text-sm rounded-lg',
};

export function GameBoard({
  board,
  onSquareClick,
  highlightCoord,
  revealableCoords,
  showAll,
  size = 'md',
  className,
  disabled,
}: BoardProps) {
  return (
    <div className={cn('w-full', className)}>
      {/* column headers */}
      <div className={cn('grid grid-cols-10 mb-1', SIZE_CLASS[size])}>
        {COLUMNS.map((c) => (
          <div
            key={c}
            className="text-center text-[10px] sm:text-xs font-mono font-semibold text-muted-foreground"
          >
            {c}
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {/* row numbers */}
        <div className="flex flex-col justify-around pr-1">
          {Array.from({ length: BOARD_SIZE }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-center text-[10px] sm:text-xs font-mono font-semibold text-muted-foreground"
              style={{ height: size === 'lg' ? undefined : undefined }}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <div className="flex-1">
          <div className={cn('grid grid-cols-10', SIZE_CLASS[size])}>
            {board.map((sq, idx) => (
              <BoardCell
                key={sq.coord}
                square={sq}
                index={idx}
                onClick={onSquareClick}
                highlight={highlightCoord === sq.coord}
                revealable={revealableCoords?.has(sq.coord)}
                showAll={showAll}
                size={size}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardCell({
  square,
  index,
  onClick,
  highlight,
  revealable,
  showAll,
  size,
  disabled,
}: {
  square: Square;
  index: number;
  onClick?: (coord: string) => void;
  highlight?: boolean;
  revealable?: boolean;
  showAll?: boolean;
  size: NonNullable<BoardProps['size']>;
  disabled?: boolean;
}) {
  const revealed = square.revealed || showAll;
  const content = square.content;
  const isCash = content.kind === 'cash';
  const isPower = content.kind === 'power';
  const isEmpty = content.kind === 'empty';
  const cashValue = isCash ? content.value : 0;
  const power = isPower ? content.power : null;
  const clickable = !!onClick && !disabled && (revealable || square.revealed || showAll);
  const isJackpot = isCash && cashValue >= 500;
  const isHighValue = isCash && cashValue >= 100 && cashValue < 500;

  // CSS-only hover tooltip: show "F7" by default, or "F7 · $50" / "F7 · Anchor"
  // when the square has been revealed. Mini size skips the tooltip to avoid
  // overflow on dense board overviews.
  const tooltipContent =
    revealed && isCash
      ? `$${cashValue}`
      : revealed && power
        ? (POWERS[power]?.label ?? 'Power')
        : isEmpty
          ? 'Empty'
          : '';

  return (
    <motion.button
      type="button"
      initial={false}
      whileTap={clickable ? { scale: 0.9 } : undefined}
      onClick={() => clickable && onClick?.(square.coord)}
      disabled={!clickable}
      data-coord={square.coord}
      data-content={tooltipContent || undefined}
      className={cn(
        'relative flex items-center justify-center border font-mono font-bold transition-colors select-none overflow-hidden',
        CELL_CLASS[size],
        // CSS hover tooltip (skipped on mini to keep dense grids uncluttered)
        size !== 'mini' && 'cell-tooltip',
        // Hidden squares — parchment treasure-tile texture
        !revealed && 'border-border text-muted-foreground treasure-tile',
        revealable && !revealed && 'treasure-tile-revealable border-gold/60 text-gold/90',
        // Cash squares — coin-3d + glow tier
        revealed && isCash && cashBgClass(cashValue),
        revealed && isCash && 'coin-3d',
        revealed && isCash && (isHighValue || isJackpot) && 'coin-glow',
        revealed && isCash && isJackpot && 'coin-shimmer',
        // Power squares — colored chip + aura
        revealed && isPower && power && powerChipClass(power),
        revealed && isPower && power && powerAuraClass(power),
        // Highlight (current called coord)
        highlight && 'ring-2 ring-gold ring-offset-1 ring-offset-background animate-pulse-ring z-10',
        revealable && !revealed && 'cursor-pointer',
        clickable && 'treasure-tile-clickable',
        disabled && 'opacity-60',
      )}
      aria-label={`Square ${square.coord}${revealed ? '' : revealable ? ' — revealable' : ' — hidden'}`}
    >
      {revealed ? (
        <>
          {/* Sparkle burst on reveal */}
          <span className="sparkle-burst pointer-events-none absolute inset-0" aria-hidden />
          <motion.div
            initial={{ rotateY: 90, opacity: 0, scale: 0.6 }}
            animate={{ rotateY: 0, opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, delay: 0, type: 'spring', stiffness: 220, damping: 18 }}
            className={cn(
              'flex flex-col items-center justify-center leading-none relative z-[1]',
              isPower && power && 'animate-float-slow',
            )}
          >
            {isCash ? (
              <span className={cn('font-bold', cashColorClass(cashValue))}>
                {cashValue >= 1000 ? '1K' : cashValue}
              </span>
            ) : isPower ? (
              <PowerIcon power={power!} className="h-3 w-3 sm:h-4 sm:w-4" />
            ) : (
              <span className="text-muted-foreground/40 text-[10px]">·</span>
            )}
          </motion.div>
        </>
      ) : revealable ? (
        <>
          <span className="treasure-tile-watermark" aria-hidden>?</span>
          <span className="relative z-[1] text-gold/90 text-[10px] font-bold drop-shadow-[0_0_4px_color-mix(in_oklch,var(--gold)_60%,transparent)]">?</span>
        </>
      ) : (
        <>
          <span className="treasure-tile-watermark" aria-hidden>✦</span>
          <span className="relative z-[1] opacity-30 text-[10px]">·</span>
        </>
      )}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Small UI atoms
// ---------------------------------------------------------------------------

export function MoneyPill({
  value,
  label,
  tone = 'default',
  icon,
  variant,
}: {
  value: number | string;
  label: string;
  tone?: 'default' | 'gold' | 'ocean' | 'danger';
  icon?: React.ReactNode;
  /** Visual variant for special pills (at-risk / banked). */
  variant?: 'at-risk' | 'banked';
}) {
  const numericValue = typeof value === 'number' ? value : null;
  const prevRef = useRef<number | null>(null);
  const [flashClass, setFlashClass] = useState<string>('');

  useEffect(() => {
    if (numericValue === null) return;
    if (prevRef.current === null) {
      prevRef.current = numericValue;
      return;
    }
    if (prevRef.current === numericValue) return;
    const delta = numericValue - prevRef.current;
    prevRef.current = numericValue;
    const cls = delta > 0 ? 'money-flash-gain' : 'money-flash-loss';
    setFlashClass(cls);
    const t = window.setTimeout(() => setFlashClass(''), 750);
    return () => window.clearTimeout(t);
  }, [numericValue]);

  const toneClass = {
    default: 'bg-secondary/60 text-foreground border-border',
    gold: 'bg-gold/15 text-gold border-gold/40',
    ocean: 'bg-ocean/15 text-ocean border-ocean/40',
    danger: 'bg-destructive/15 text-destructive border-destructive/40',
  }[tone];

  const variantClass = variant === 'at-risk' ? 'money-at-risk' : variant === 'banked' ? 'money-banked' : '';

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 flex flex-col gap-0.5 transition-colors',
        toneClass,
        variantClass,
        flashClass,
      )}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-80">
        {icon ?? (variant === 'banked' ? <Lock className="h-3 w-3" /> : <Coins className="h-3 w-3" />)}
        {label}
      </div>
      <div className="text-lg font-bold font-mono tabular-nums flex items-center gap-1">
        {variant === 'at-risk' && <Coins className="h-3.5 w-3.5 text-gold/80" />}
        {variant === 'banked' && <Landmark className="h-3.5 w-3.5 text-ocean/80" />}
        {typeof value === 'number' ? (
          <AnimatedNumber value={value} format={(n) => `$${n.toLocaleString()}`} />
        ) : (
          value
        )}
      </div>
    </div>
  );
}

export function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        connected ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40',
      )}
    />
  );
}
