'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/hooks/pirate/useGameStore';
import { useSound } from '@/components/pirate/SoundManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Anchor, Ship, Skull, Swords, Map, Users, Coins, Gem, Compass, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function RoleSelect() {
  const createGame = useGameStore((s) => s.createGame);
  const joinGame = useGameStore((s) => s.joinGame);
  const joinAsSpectator = useGameStore((s) => s.joinAsSpectator);
  const { play } = useSound();
  const [tab, setTab] = useState<'host' | 'player' | 'spectator'>('host');
  const [hostName, setHostName] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [specName, setSpecName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleHost = async () => {
    setErr(null);
    setBusy(true);
    play('click');
    const r = await createGame(hostName.trim() || 'Captain');
    setBusy(false);
    if (r.error) setErr(r.error);
  };

  const handleJoin = async () => {
    setErr(null);
    if (!code.trim()) {
      setErr('Enter a game code');
      return;
    }
    if (!name.trim()) {
      setErr('Enter your display name');
      return;
    }
    setBusy(true);
    play('click');
    const r = await joinGame(code.trim(), name.trim());
    setBusy(false);
    if (r.error) setErr(r.error);
  };

  const handleSpectate = async () => {
    setErr(null);
    if (!code.trim()) {
      setErr('Enter a game code');
      return;
    }
    setBusy(true);
    play('click');
    const r = await joinAsSpectator(code.trim(), specName.trim() || 'Spectator');
    setBusy(false);
    if (r.error) setErr(r.error);
  };

  return (
    <div className="relative min-h-[calc(100vh-3rem)] flex flex-col items-center justify-center px-4 py-10 overflow-hidden">
      {/* decorative floating icons + ocean waves at bottom */}
      <DecorBackground />
      <div className="ocean-waves-bottom" aria-hidden />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-lg"
      >
        {/* hero */}
        <div className="text-center mb-6">
          <motion.div
            initial={{ scale: 0.8, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 14 }}
            className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-ocean/15 border border-ocean/40 mb-4 animate-float-slow"
          >
            <Anchor className="h-10 w-10 text-ocean" />
          </motion.div>
          <h1 className="font-display text-5xl sm:text-6xl gold-text leading-none title-pirate inline-block">
            Pirate Game
          </h1>
          <p className="text-muted-foreground mt-3 text-sm sm:text-base max-w-sm mx-auto">
            A real-time multiplayer treasure hunt. One host calls coordinates —
            every player digs their own secret 10×10 board.
          </p>
        </div>

        {/* Decorative divider between hero and card */}
        <div className="divider-pirate mb-6" aria-hidden>
          <Compass className="h-4 w-4 animate-float-slow" />
          <Skull className="h-3.5 w-3.5" />
          <Anchor className="h-4 w-4" />
        </div>

        <div className="pirate-card pirate-card-hover p-5 sm:p-6">
          <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setErr(null); play('click'); }}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="host" className="gap-1.5">
                <Swords className="h-3.5 w-3.5" /> Host
              </TabsTrigger>
              <TabsTrigger value="player" className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> Join
              </TabsTrigger>
              <TabsTrigger value="spectator" className="gap-1.5">
                <Eye className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Spectate</span><span className="sm:hidden">Watch</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="host" className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hostName" className="flex items-center gap-1.5 text-xs">
                  <Skull className="h-3.5 w-3.5" /> Captain name (optional)
                </Label>
                <Input
                  id="hostName"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="Captain Hook"
                  maxLength={20}
                  onKeyDown={(e) => e.key === 'Enter' && !busy && handleHost()}
                />
              </div>
              <div className="rounded-lg border border-ocean/30 bg-ocean/5 p-3 text-xs text-muted-foreground space-y-1.5">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Map className="h-3.5 w-3.5 text-gold" /> What the host does
                </div>
                <ul className="space-y-1 list-disc pl-4">
                  <li>Generate a join code and share it with players</li>
                  <li>Call coordinates (e.g. F7) for everyone to reveal</li>
                  <li>Monitor boards, activity, and stats in real time</li>
                  <li>Pause, undo, override, and end the game</li>
                </ul>
              </div>
              <Button onClick={handleHost} disabled={busy} className="w-full h-11 text-base gap-2 btn-pirate" size="lg">
                <Ship className="h-4 w-4" />
                {busy ? 'Setting sail…' : 'Create Game'}
              </Button>
            </TabsContent>

            <TabsContent value="player" className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code" className="flex items-center gap-1.5 text-xs">
                  <Map className="h-3.5 w-3.5 text-gold" /> Game code
                </Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="ABCDEF"
                  className="text-center font-mono text-2xl tracking-[0.4em] font-bold h-14"
                  onKeyDown={(e) => e.key === 'Enter' && !busy && handleJoin()}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-1.5 text-xs">
                  <Users className="h-3.5 w-3.5" /> Display name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 20))}
                  placeholder="Blackbeard"
                  onKeyDown={(e) => e.key === 'Enter' && !busy && handleJoin()}
                />
              </div>
              <Button onClick={handleJoin} disabled={busy} className="w-full h-11 text-base gap-2 btn-pirate" size="lg">
                <Anchor className="h-4 w-4" />
                {busy ? 'Boarding…' : 'Join Game'}
              </Button>
            </TabsContent>

            <TabsContent value="spectator" className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="spec-code" className="flex items-center gap-1.5 text-xs">
                  <Map className="h-3.5 w-3.5 text-gold" /> Game code
                </Label>
                <Input
                  id="spec-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="ABCDEF"
                  className="text-center font-mono text-2xl tracking-[0.4em] font-bold h-14"
                  onKeyDown={(e) => e.key === 'Enter' && !busy && handleSpectate()}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="specName" className="flex items-center gap-1.5 text-xs">
                  <Eye className="h-3.5 w-3.5" /> Display name (optional)
                </Label>
                <Input
                  id="specName"
                  value={specName}
                  onChange={(e) => setSpecName(e.target.value.slice(0, 20))}
                  placeholder="Lookout Lou"
                  onKeyDown={(e) => e.key === 'Enter' && !busy && handleSpectate()}
                />
              </div>
              <div className="rounded-lg border border-ocean/30 bg-ocean/5 p-3 text-xs text-muted-foreground space-y-1.5">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Eye className="h-3.5 w-3.5 text-ocean" /> Spectator mode
                </div>
                <p>
                  Watch the game unfold in real-time. No board, no powers — just
                  observe the leaderboard, revealed squares, and activity feed.
                </p>
              </div>
              <Button
                onClick={handleSpectate}
                disabled={busy}
                className="w-full h-11 text-base gap-2 btn-pirate"
                size="lg"
                variant="outline"
              >
                <Eye className="h-4 w-4" />
                {busy ? 'Climbing the mast…' : 'Join as Spectator'}
              </Button>
            </TabsContent>
          </Tabs>

          {err && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn('mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive')}
            >
              {err}
            </motion.div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-5">
          No account required · Works on phone, tablet & desktop
        </p>
        {/* Σ(Cor)²an — creator logo */}
        <div className="text-center mt-5 flex flex-col items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 text-sm font-mono font-bold tracking-wider text-foreground/70">
            by Mr Stephen Corcoran
          </span>
          <span className="inline-flex items-center gap-1 text-lg font-mono font-extrabold tracking-tight gold-text select-none">
            Σ(Cor)<sup>2</sup>an
          </span>
        </div>
      </motion.div>
    </div>
  );
}

function DecorBackground() {
  const items = [
    { Icon: Anchor, x: '6%', y: '14%', d: 0, s: 1, dur: 7, op: 0.12 },
    { Icon: Ship, x: '85%', y: '10%', d: 0.6, s: 1.2, dur: 8, op: 0.14 },
    { Icon: Skull, x: '78%', y: '70%', d: 1.2, s: 0.9, dur: 6.5, op: 0.10 },
    { Icon: Map, x: '10%', y: '72%', d: 1.8, s: 1.1, dur: 7.5, op: 0.12 },
    { Icon: Coins, x: '40%', y: '12%', d: 2.2, s: 0.85, dur: 9, op: 0.10 },
    { Icon: Gem, x: '52%', y: '85%', d: 0.9, s: 0.95, dur: 8.5, op: 0.11 },
    { Icon: Compass, x: '88%', y: '40%', d: 1.5, s: 1, dur: 7, op: 0.10 },
    { Icon: Map, x: '4%', y: '45%', d: 2.6, s: 0.9, dur: 9.5, op: 0.10 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map(({ Icon, x, y, d, s, dur, op }, i) => (
        <motion.div
          key={i}
          className="absolute text-ocean/8 dark:text-ocean/12"
          style={{ left: x, top: y, opacity: op }}
          initial={{ opacity: 0 }}
          animate={{ opacity: op, y: [0, -14, 0], rotate: [0, 4, -4, 0] }}
          transition={{
            opacity: { duration: 1, delay: d },
            y: { duration: dur, repeat: Infinity, ease: 'easeInOut', delay: d },
            rotate: { duration: dur * 1.3, repeat: Infinity, ease: 'easeInOut', delay: d },
          }}
        >
          <Icon style={{ width: 48 * s, height: 48 * s }} />
        </motion.div>
      ))}
    </div>
  );
}
