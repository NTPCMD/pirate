'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Shuffle, Trash2, CheckCircle2, Eye, Flag, Wand2, Crosshair, Grid3x3, CornerDownRight, MoveDiagonal, Square as SquareIcon } from 'lucide-react';
import { useGameStore } from '@/hooks/pirate/useGameStore';
import { useSound } from '@/components/pirate/SoundManager';
import { GameBoard, PowerIcon, powerChipClass, cashColorClass, cashBgClass } from '@/components/pirate/common';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BOARD_PALETTE,
  COLUMNS,
  BOARD_SIZE,
  POWERS,
  type Board,
  type CashValue,
  type PaletteEntry,
  type PowerType,
  type Square,
  type SquareContent,
  indexToCoord,
} from '@/lib/pirate/types';
import { BOARD_TEMPLATES } from '@/lib/pirate/templates';
import { cn } from '@/lib/utils';

// A palette "slot" the player can select to place on the board.
interface PaletteSlot {
  entry: PaletteEntry;
  remaining: number;
  key: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function contentKey(c: SquareContent): string {
  if (c.kind === 'cash') return `cash:${c.value}`;
  if (c.kind === 'power') return `power:${c.power}`;
  return 'empty';
}

function emptyContent(): SquareContent {
  return { kind: 'empty' };
}

export function BoardEditor() {
  const playerState = useGameStore((s) => s.playerState);
  const setBoardLayout = useGameStore((s) => s.setBoardLayout);
  const setReady = useGameStore((s) => s.setReady);
  const { play } = useSound();

  // Local board state — initialized from the server, edited locally, synced back.
  const [board, setBoard] = useState<Board>(() =>
    playerState?.me.board
      ? playerState.me.board.map((s) => ({ ...s, content: s.content }))
      : [],
  );
  const [selected, setSelected] = useState<string | null>(null); // palette key
  const [synced, setSynced] = useState(true);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedRef = useRef<string>('');

  // Re-init when the server board changes externally (e.g. reconnect)
  const serverBoard = playerState?.me.board;
  useEffect(() => {
    if (!serverBoard) return;
    const serverJson = JSON.stringify(serverBoard.map((s) => s.content));
    // Only re-init if the server state differs significantly from our local
    // state (e.g. after reconnect or host reset). Ignore minor echoes.
    if (serverJson !== lastSyncedRef.current && serverJson !== JSON.stringify(board.map((s) => s.content))) {
      setBoard(serverBoard.map((s) => ({ ...s, content: s.content })));
      lastSyncedRef.current = serverJson;
    }
  }, [serverBoard]);

  // Compute remaining counts for each palette entry
  const paletteSlots: PaletteSlot[] = useMemo(() => {
    const placed = new Map<string, number>();
    for (const sq of board) {
      const k = contentKey(sq.content);
      if (k !== 'empty') placed.set(k, (placed.get(k) ?? 0) + 1);
    }
    return BOARD_PALETTE.map((entry) => {
      const key = entry.kind === 'cash' ? `cash:${entry.value}` : `power:${entry.power}`;
      const remaining = entry.count - (placed.get(key) ?? 0);
      return { entry, remaining, key };
    });
  }, [board]);

  const placedCount = useMemo(
    () => board.filter((s) => s.content.kind !== 'empty').length,
    [board],
  );

  // Debounced server sync
  const syncToServer = useCallback(
    (newBoard: Board) => {
      setSynced(false);
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(async () => {
        const layout = newBoard.map((s) => s.content);
        const r = await setBoardLayout(layout);
        if (!r.error) {
          lastSyncedRef.current = JSON.stringify(layout);
          setSynced(true);
        }
      }, 400);
    },
    [setBoardLayout],
  );

  const handleSquareClick = useCallback(
    (coord: string) => {
      setBoard((prev) => {
        const idx = prev.findIndex((s) => s.coord === coord);
        if (idx < 0) return prev;
        const current = prev[idx].content;
        const newBoard = [...prev];

        if (selected) {
          // Place the selected item
          const slot = paletteSlots.find((s) => s.key === selected);
          if (!slot || slot.remaining <= 0) return prev;

          // If clicking the same content that's already there, remove it instead
          if (contentKey(current) === selected) {
            newBoard[idx] = { ...newBoard[idx], content: emptyContent() };
            play('click');
          } else {
            const content: SquareContent =
              slot.entry.kind === 'cash'
                ? { kind: 'cash', value: slot.entry.value as CashValue }
                : { kind: 'power', power: slot.entry.power as PowerType };
            newBoard[idx] = { ...newBoard[idx], content };
            play('click');
          }
        } else {
          // No item selected — clicking removes whatever is there
          if (current.kind !== 'empty') {
            newBoard[idx] = { ...newBoard[idx], content: emptyContent() };
            play('click');
          }
        }
        syncToServer(newBoard);
        return newBoard;
      });
    },
    [selected, paletteSlots, play, syncToServer],
  );

  const handleRandomize = useCallback(() => {
    play('click');
    setBoard((prev) => {
      // Build remaining palette items
      const placed = new Map<string, number>();
      for (const sq of prev) {
        const k = contentKey(sq.content);
        if (k !== 'empty') placed.set(k, (placed.get(k) ?? 0) + 1);
      }
      const remaining: SquareContent[] = [];
      for (const slot of BOARD_PALETTE) {
        const key = slot.kind === 'cash' ? `cash:${slot.value}` : `power:${slot.power}`;
        const need = Math.max(0, slot.count - (placed.get(key) ?? 0));
        for (let i = 0; i < need; i++) {
          if (slot.kind === 'cash') {
            remaining.push({ kind: 'cash', value: slot.value as CashValue });
          } else {
            remaining.push({ kind: 'power', power: slot.power as PowerType });
          }
        }
      }
      const shuffled = shuffle(remaining);
      let idx = 0;
      const newBoard = prev.map((sq) => {
        if (sq.content.kind === 'empty' && idx < shuffled.length) {
          return { ...sq, content: shuffled[idx++] };
        }
        return sq;
      });
      syncToServer(newBoard);
      return newBoard;
    });
  }, [play, syncToServer]);

  const handleRandomizeAll = useCallback(() => {
    play('click');
    setBoard((prev) => {
      // Full random: build the entire palette and shuffle
      const all: SquareContent[] = [];
      for (const slot of BOARD_PALETTE) {
        for (let i = 0; i < slot.count; i++) {
          if (slot.kind === 'cash') {
            all.push({ kind: 'cash', value: slot.value as CashValue });
          } else {
            all.push({ kind: 'power', power: slot.power as PowerType });
          }
        }
      }
      const shuffled = shuffle(all);
      const newBoard = prev.map((sq, i) => ({ ...sq, content: shuffled[i] }));
      syncToServer(newBoard);
      return newBoard;
    });
  }, [play, syncToServer]);

  const handleClear = useCallback(() => {
    play('click');
    setBoard((prev) => {
      const newBoard = prev.map((sq) => ({ ...sq, content: emptyContent() }));
      syncToServer(newBoard);
      return newBoard;
    });
  }, [play, syncToServer]);

  const handleApplyTemplate = useCallback(
    (generate: () => SquareContent[]) => {
      play('power');
      setBoard((prev) => {
        const layout = generate();
        const newBoard = prev.map((sq, i) => ({ ...sq, content: layout[i] }));
        syncToServer(newBoard);
        return newBoard;
      });
    },
    [play, syncToServer],
  );

  if (!playerState || board.length === 0) {
    return null;
  }

  const isLocked = playerState.me.boardLocked;
  const allPlaced = placedCount === 100;
  const isReady = !!playerState.me.ready;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="pirate-card p-4 sm:p-6"
      aria-label="Board setup"
    >
      <header className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Eye className="h-4 w-4 text-gold" />
          Set Up Your Board
        </h2>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'tabular-nums',
              allPlaced
                ? 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10'
                : 'border-gold/40 text-gold bg-gold/10',
            )}
          >
            {placedCount}/100
          </Badge>
          {synced ? (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Saved
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground animate-pulse">Saving…</span>
          )}
        </div>
      </header>

      {isLocked ? (
        <p className="text-xs text-muted-foreground mb-3">
          Board is locked — the game has started.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground mb-3">
          Tap an item below, then tap a square to place it. Tap a placed square to remove it.
          Any empty squares when the host starts will be filled randomly.
        </p>
      )}

      {/* The board */}
      <div className={cn('rounded-lg border border-border/60 p-2 sm:p-3 bg-card/40', isLocked && 'opacity-70 pointer-events-none')}>
        <GameBoard
          board={board}
          onSquareClick={handleSquareClick}
          showAll={true}
          size="sm"
          disabled={isLocked}
        />
      </div>

      {/* Palette */}
      <div className="mt-4 space-y-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Treasure to place
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
          {paletteSlots.map((slot) => {
            const isSelected = selected === slot.key;
            const isDisabled = slot.remaining <= 0 || isLocked;
            const isCash = slot.entry.kind === 'cash';
            const value = slot.entry.value as CashValue;
            const power = slot.entry.power as PowerType;
            return (
              <button
                key={slot.key}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) return;
                  play('click');
                  setSelected(isSelected ? null : slot.key);
                }}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 rounded-lg border p-1.5 min-h-[44px] transition-all',
                  isCash && cashBgClass(value),
                  !isCash && powerChipClass(power),
                  isSelected && 'ring-2 ring-gold ring-offset-1 ring-offset-background scale-105',
                  isDisabled && 'opacity-40 cursor-not-allowed',
                  !isDisabled && !isSelected && 'hover:scale-105 hover:border-gold/50',
                )}
                aria-label={`Place ${slot.entry.label} (${slot.remaining} remaining)`}
                aria-pressed={isSelected}
              >
                {isCash ? (
                  <span className={cn('font-bold text-xs', cashColorClass(value))}>
                    {value >= 1000 ? '1K' : value}
                  </span>
                ) : (
                  <PowerIcon power={power} className="h-3.5 w-3.5" />
                )}
                <span className="text-[9px] text-muted-foreground tabular-nums">
                  ×{slot.remaining}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Templates — quick preset layouts */}
      {!isLocked && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Wand2 className="h-3 w-3 text-gold" />
            Quick templates
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {BOARD_TEMPLATES.map((tpl) => {
              const Icon =
                tpl.icon === 'Crosshair' ? Crosshair
                : tpl.icon === 'Grid3x3' ? Grid3x3
                : tpl.icon === 'CornerDownRight' ? CornerDownRight
                : tpl.icon === 'MoveDiagonal' ? MoveDiagonal
                : SquareIcon;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleApplyTemplate(tpl.generate)}
                  className="group flex items-start gap-2 rounded-lg border border-border bg-card/60 p-2 text-left transition-all hover:border-gold/50 hover:bg-gold/5 hover:scale-[1.02] min-h-[52px]"
                  aria-label={`Apply ${tpl.label} template: ${tpl.description}`}
                  title={tpl.description}
                >
                  <Icon className="h-4 w-4 text-ocean shrink-0 mt-0.5 group-hover:text-gold transition-colors" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">{tpl.label}</div>
                    <div className="text-[9px] text-muted-foreground leading-tight line-clamp-2">
                      {tpl.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      {!isLocked && (
        <>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={handleRandomize}
            variant="outline"
            size="sm"
            className="gap-1.5 btn-pirate"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Fill Empty
          </Button>
          <Button
            onClick={handleRandomizeAll}
            variant="outline"
            size="sm"
            className="gap-1.5 btn-pirate"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Randomize All
          </Button>
          <Button
            onClick={handleClear}
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive hover:bg-destructive/10 btn-pirate"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>

        {/* Ready toggle */}
        <div className="mt-3 flex items-center gap-3">
          <Button
            onClick={() => { play('click'); setReady(!isReady); }}
            disabled={isLocked}
            size="sm"
            variant={isReady ? 'default' : 'outline'}
            className={cn(
              'gap-1.5 btn-pirate min-h-[40px]',
              isReady
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                : 'border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10',
            )}
            aria-pressed={isReady}
          >
            <Flag className="h-3.5 w-3.5" />
            {isReady ? 'Ready!' : 'Mark as Ready'}
          </Button>
          <span className="text-xs text-muted-foreground">
            {isReady
              ? 'You\'re ready — waiting for the host to start.'
              : allPlaced
                ? 'Board is full — mark ready when you\'re set.'
                : 'Finish your board, then mark ready. Empty squares will auto-fill.'}
          </span>
        </div>
        </>
      )}
    </motion.article>
  );
}
