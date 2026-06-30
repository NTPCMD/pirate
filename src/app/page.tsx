'use client';

import { useEffect } from 'react';
import { useGameStore } from '@/hooks/pirate/useGameStore';
import { ToastOverlay } from '@/components/pirate/ToastOverlay';
import RoleSelect from '@/components/pirate/RoleSelect';
import HostLobby from '@/components/pirate/HostLobby';
import PlayerLobby from '@/components/pirate/PlayerLobby';
import HostDashboard from '@/components/pirate/HostDashboard';
import PlayerGame from '@/components/pirate/PlayerGame';
import SpectatorView from '@/components/pirate/SpectatorView';
import EndGameResults from '@/components/pirate/EndGameResults';
import { GameFooter } from '@/components/pirate/Footer';
import { KickedScreen } from '@/components/pirate/KickedScreen';
import { ReactionLayer } from '@/components/pirate/ReactionLayer';

export default function Home() {
  const init = useGameStore((s) => s.init);
  const role = useGameStore((s) => s.role);
  const kicked = useGameStore((s) => s.kicked);
  const results = useGameStore((s) => s.results);
  const hostState = useGameStore((s) => s.hostState);
  const playerState = useGameStore((s) => s.playerState);

  useEffect(() => {
    init();
  }, [init]);

  let screen: React.ReactNode = <RoleSelect />;

  if (kicked) {
    screen = <KickedScreen />;
  } else if (results) {
    // Spectators see results inline as a "player" view (no host export/new game controls)
    screen = <EndGameResults role={role === 'host' ? 'host' : role === 'spectator' ? 'spectator' : 'player'} />;
  } else if (role === 'host') {
    screen = hostState?.status === 'lobby' ? <HostLobby /> : <HostDashboard />;
  } else if (role === 'player') {
    screen = !playerState || playerState.status === 'lobby' ? <PlayerLobby /> : <PlayerGame />;
  } else if (role === 'spectator') {
    screen = <SpectatorView />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 w-full">{screen}</main>
      <GameFooter />
      <ToastOverlay />
      {/* Floating emoji reactions — rendered once at the root so the overlay
          is visible across host, player, and spectator screens alike. High
          z-index + pointer-events-none so it never blocks interaction. */}
      <ReactionLayer />
    </div>
  );
}