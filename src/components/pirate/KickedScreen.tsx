'use client';

import { useGameStore } from '@/hooks/pirate/useGameStore';
import { Button } from '@/components/ui/button';
import { Skull } from 'lucide-react';

export function KickedScreen() {
  const reset = useGameStore((s) => s.reset);
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6 p-6 text-center">
      <Skull className="h-16 w-16 text-destructive animate-float-slow" />
      <div>
        <h2 className="font-display text-3xl text-destructive">Ye walked the plank</h2>
        <p className="text-muted-foreground mt-2">The host removed you from the game.</p>
      </div>
      <Button onClick={reset} variant="default">
        Back to port
      </Button>
    </div>
  );
}
