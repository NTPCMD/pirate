'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useGameStore } from '@/hooks/pirate/useGameStore';
import { useSound } from '@/components/pirate/SoundManager';
import { Volume2, VolumeX, Wifi, WifiOff, Skull, Anchor, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function GameFooter() {
  const connected = useGameStore((s) => s.connected);
  const role = useGameStore((s) => s.role);
  const code = useGameStore((s) => s.code);
  const reset = useGameStore((s) => s.reset);
  const { muted, toggleMute } = useSound();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = theme === 'dark';

  return (
    <footer className="mt-auto border-t border-border/60 bg-card/60 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Anchor className="h-3.5 w-3.5 text-gold" />
          <span className="font-display text-sm gold-text">Pirate Game</span>
          <span className="text-[10px] opacity-60 hidden sm:inline">by Mr Stephen Corcoran · <span className="gold-text font-mono font-bold">Σ(Cor)<sup>2</sup>an</span></span>
          {code && (
            <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 font-mono font-semibold text-foreground">
              {code}
            </span>
          )}
          {role !== 'none' && (
            <span className="ml-1 rounded-md bg-muted/60 px-1.5 py-0.5 capitalize">{role}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex items-center gap-1',
              connected ? 'text-emerald-500' : 'text-destructive',
            )}
            title={connected ? 'Connected' : 'Disconnected'}
          >
            {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{connected ? 'Live' : 'Offline'}</span>
          </span>
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {mounted && isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{mounted && isDark ? 'Light' : 'Dark'}</span>
          </button>
          <button
            onClick={toggleMute}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{muted ? 'Muted' : 'Sound'}</span>
          </button>
          {role !== 'none' && (
            <button
              onClick={reset}
              className="flex items-center gap-1 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Leave game"
            >
              <Skull className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Leave</span>
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}
