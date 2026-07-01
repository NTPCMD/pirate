'use client';

import { create } from 'zustand';
import { getSocket } from '@/lib/pirate/socket';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type DefensePrompt,
  type GameResults,
  type HostGameState,
  type PlayerGameState,
  type PowerType,
  type Reaction,
  type ToastPayload,
  type DefenseChoice,
  type SpectatorGameState,
} from '@/lib/pirate/types';

type Role = 'none' | 'host' | 'player' | 'spectator';

interface GameStoreState {
  role: Role;
  connected: boolean;
  code: string | null;
  hostToken: string | null;
  playerName: string | null;
  hostState: HostGameState | null;
  playerState: PlayerGameState | null;
  spectatorState: SpectatorGameState | null;
  defensePrompt: DefensePrompt | null;
  results: GameResults | null;
  toasts: ToastPayload[];
  /**
   * Ephemeral quick reactions currently being animated on this client.
   * Each entry auto-expires after REACTION_LIFETIME_MS. Driven entirely by
   * SERVER_EVENTS.reaction broadcasts — never persisted, never part of the
   * server snapshot. The ReactionLayer renders these as floating emoji.
   */
  reactions: Reaction[];
  error: string | null;
  kicked: boolean;
  // internal
  _initialized: boolean;
  _reactionTimers: Map<string, ReturnType<typeof setTimeout>>;

  init: () => void;
  createGame: (hostName: string) => Promise<{ code?: string; hostToken?: string; error?: string }>;
  reconnectHost: (hostToken: string) => Promise<{ ok?: boolean; error?: string }>;
  joinGame: (code: string, name: string) => Promise<{ ok?: boolean; error?: string; reconnected?: boolean }>;
  joinAsSpectator: (code: string, name: string) => Promise<{ ok?: boolean; error?: string }>;
  setRole: (r: Role) => void;

  startGame: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  endGame: () => void;
  callCoordinate: (coord: string) => void;
  revealSquare: (coord: string) => Promise<{ ok?: boolean; error?: string }>;
  submitTally: (guess: number) => Promise<{ ok?: boolean; correct?: boolean; error?: string }>;
  selectTarget: (powerType: PowerType, targetId: string) => Promise<{ ok?: boolean; pending?: boolean; resolved?: boolean; error?: string }>;
  resolveDefense: (promptId: string, choice: DefenseChoice) => Promise<{ ok?: boolean; error?: string }>;
  hostRevealAll: () => void;
  hostRevealSquare: (playerId: string, coord: string) => void;
  hostForceAward: (playerId: string, amount: number) => void;
  hostForceRemove: (playerId: string, amount: number) => void;
  hostEditTotal: (playerId: string, field: 'running' | 'banked', value: number) => void;
  hostEditInventory: (playerId: string, action: 'add' | 'remove', item: PowerType) => void;
  hostLockPlayers: (locked: boolean) => void;
  hostUndo: () => void;
  hostKick: (playerId: string) => void;
  hostExport: () => Promise<any>;
  addBot: () => void;
  removeBot: (playerId: string) => void;
  setTimerDuration: (seconds: number) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: () => void;
  /** Host-only: reset to lobby with the SAME players + fresh boards. */
  resetGame: () => void;
  /** Player-only: submit a custom board layout (lobby phase). */
  setBoardLayout: (layout: import('@/lib/pirate/types').SquareContent[]) => Promise<{ ok?: boolean; error?: string }>;
  /** Player-only: toggle ready state (lobby phase). */
  setReady: (ready: boolean) => void;

  /** Emit a quick emoji reaction to the server (ephemeral broadcast). */
  sendReaction: (emoji: string) => void;

  pushToast: (t: Omit<ToastPayload, 'id'>) => void;
  dismissToast: (id: string) => void;
  clearDefense: () => void;
  reset: () => void;
}

/** How long a reaction stays on screen before being removed (ms). */
export const REACTION_LIFETIME_MS = 2500;

let toastId = 0;

export const useGameStore = create<GameStoreState>((set, get) => ({
  role: 'none',
  connected: false,
  code: null,
  hostToken: null,
  playerName: null,
  hostState: null,
  playerState: null,
  spectatorState: null,
  defensePrompt: null,
  results: null,
  toasts: [],
  reactions: [],
  error: null,
  kicked: false,
  _initialized: false,
  _reactionTimers: new Map(),

  init: () => {
    if (get()._initialized) return;
    set({ _initialized: true });
    const socket = getSocket();

    socket.on('connect', () => set({ connected: true, error: null }));
    socket.on('disconnect', () => set({ connected: false }));
    socket.on('connect_error', () => set({ connected: false }));

    socket.on(SERVER_EVENTS.state, (payload: { role: 'host' | 'player' | 'spectator'; state: HostGameState | PlayerGameState | SpectatorGameState }) => {
      if (payload.role === 'host') {
        set({ hostState: payload.state as HostGameState, code: (payload.state as HostGameState).code });
      } else if (payload.role === 'spectator') {
        set({ spectatorState: payload.state as SpectatorGameState, code: (payload.state as SpectatorGameState).code });
      } else {
        set({ playerState: payload.state as PlayerGameState, code: (payload.state as PlayerGameState).code });
      }
    });

    socket.on(SERVER_EVENTS.hostCreated, (payload: { code: string; hostToken: string; hostName: string }) => {
      set({ code: payload.code, hostToken: payload.hostToken, role: 'host' });
      try {
        localStorage.setItem('pirate-host', JSON.stringify({ code: payload.code, hostToken: payload.hostToken, hostName: payload.hostName }));
      } catch {}
    });

    socket.on(SERVER_EVENTS.defensePrompt, (prompt: DefensePrompt) => {
      set({ defensePrompt: prompt });
    });

    socket.on(SERVER_EVENTS.toast, (toast: ToastPayload) => {
      set((s) => ({ toasts: [...s.toasts, toast] }));
      // auto dismiss after 4s
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== toast.id) }));
      }, 4200);
    });

    socket.on(SERVER_EVENTS.gameEnded, (results: GameResults) => {
      set({ results });
    });

    // Server-initiated reset (host pressed "Play Again"). Clear local
    // results so the router sends the user back to the lobby view. The
    // accompanying state snapshot (status='lobby') arrives via the normal
    // `state` event and provides the fresh boards.
    socket.on(SERVER_EVENTS.gameReset, () => {
      set({ results: null, defensePrompt: null });
    });

    socket.on(SERVER_EVENTS.kicked, () => {
      set({ kicked: true });
    });

    socket.on(SERVER_EVENTS.reaction, (reaction: Reaction) => {
      if (!reaction?.id) return;
      // Push the new reaction into the active list and schedule its removal.
      set((s) => ({ reactions: [...s.reactions, reaction] }));
      const timers = get()._reactionTimers;
      // If a timer already exists for this id (shouldn't, but be safe), clear it first.
      const existing = timers.get(reaction.id);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        set((s) => ({ reactions: s.reactions.filter((r) => r.id !== reaction.id) }));
        const next = get()._reactionTimers;
        next.delete(reaction.id);
        set({ _reactionTimers: next });
      }, REACTION_LIFETIME_MS);
      timers.set(reaction.id, t);
      // Re-set the map reference so Zustand picks up the change (the Map is
      // mutated in place above; we don't need reactivity on this internal
      // field, but writing it back keeps the snapshot honest).
      set({ _reactionTimers: timers });
    });

    socket.on(SERVER_EVENTS.error, (payload: { message: string }) => {
      set({ error: payload.message });
      setTimeout(() => set({ error: null }), 4000);
    });

    // attempt silent host reconnect
    try {
      const raw = localStorage.getItem('pirate-host');
      if (raw) {
        const { hostToken } = JSON.parse(raw);
        if (hostToken) {
          socket.emit('host:reconnect', { hostToken }, (r: any) => {
            if (r?.ok) set({ role: 'host' });
          });
        }
      }
    } catch {}

    // attempt silent player reconnect (rejoin by name — server matches by name)
    try {
      const rawP = localStorage.getItem('pirate-player');
      if (rawP) {
        const { code, name } = JSON.parse(rawP);
        if (code && name) {
          socket.emit(CLIENT_EVENTS.playerJoin, { code, name }, (r: any) => {
            if (r?.ok) {
              set({ role: 'player', code, playerName: name });
            } else {
              // rejoin failed (game ended / not found) — clear stale session
              try { localStorage.removeItem('pirate-player'); } catch {}
            }
          });
        }
      }
    } catch {}
  },

  setRole: (r) => set({ role: r }),

  createGame: (hostName) => {
    const socket = getSocket();
    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.hostCreate, { hostName }, (r: any) => {
        if (r?.error) resolve({ error: r.error });
        else resolve({ code: r?.code, hostToken: r?.hostToken });
      });
      // fallback if no ack — also listen for hostCreated
      const timer = setTimeout(() => {
        const st = get();
        if (st.code && st.hostToken) resolve({ code: st.code, hostToken: st.hostToken });
      }, 1500);
      socket.once(SERVER_EVENTS.hostCreated, () => {
        clearTimeout(timer);
        const st = get();
        resolve({ code: st.code ?? undefined, hostToken: st.hostToken ?? undefined });
      });
    });
  },

  reconnectHost: (hostToken) => {
    const socket = getSocket();
    return new Promise((resolve) => {
      socket.emit('host:reconnect', { hostToken }, (r: any) => {
        if (r?.ok) {
          set({ role: 'host' });
          resolve({ ok: true });
        } else resolve({ error: r?.error ?? 'Reconnect failed' });
      });
    });
  },

  joinGame: (code, name) => {
    const socket = getSocket();
    set({ playerName: name });
    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.playerJoin, { code, name }, (r: any) => {
        if (r?.error) resolve({ error: r.error });
        else {
          set({ role: 'player', code: code.toUpperCase() });
          try {
            localStorage.setItem('pirate-player', JSON.stringify({ code: code.toUpperCase(), name }));
          } catch {}
          resolve({ ok: true, reconnected: r?.reconnected });
        }
      });
    });
  },

  joinAsSpectator: (code, name) => {
    const socket = getSocket();
    set({ playerName: name });
    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.spectatorJoin, { code, name }, (r: any) => {
        if (r?.error) resolve({ error: r.error });
        else {
          // No localStorage persistence for spectators — they re-join manually
          // on reload (per spec).
          set({ role: 'spectator', code: code.toUpperCase() });
          resolve({ ok: true });
        }
      });
    });
  },

  startGame: () => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostStart, { code });
  },
  pauseGame: () => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostPause, { code });
  },
  resumeGame: () => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostResume, { code });
  },
  endGame: () => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostEnd, { code });
  },
  callCoordinate: (coord) => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostCallCoord, { code, coord });
  },
  revealSquare: (coord) => {
    const { code } = get();
    if (!code) return Promise.resolve({ error: 'No game' });
    const socket = getSocket();
    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.playerReveal, { code, coord }, (r: any) => {
        resolve(r?.error ? { error: r.error } : { ok: true });
      });
    });
  },
  submitTally: (guess) => {
    const { code } = get();
    if (!code) return Promise.resolve({ error: 'No game' });
    const socket = getSocket();
    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.playerSubmitTally, { code, guess }, (r: any) => {
        resolve(r?.error ? { error: r.error } : { ok: true, correct: !!r?.correct });
      });
    });
  },
  selectTarget: (powerType, targetId) => {
    const { code } = get();
    if (!code) return Promise.resolve({ error: 'No game' });
    const socket = getSocket();
    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.playerSelectTarget, { code, powerType, targetId }, (r: any) => {
        resolve(r?.error ? { error: r.error } : { ok: true, pending: r?.pending, resolved: r?.resolved });
      });
    });
  },
  resolveDefense: (promptId, choice) => {
    const { code } = get();
    if (!code) return Promise.resolve({ error: 'No game' });
    const socket = getSocket();
    set({ defensePrompt: null });
    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.playerDefenseChoice, { code, promptId, choice }, (r: any) => {
        resolve(r?.error ? { error: r.error } : { ok: true });
      });
    });
  },
  hostRevealAll: () => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostRevealAll, { code });
  },
  hostRevealSquare: (playerId, coord) => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostRevealSquare, { code, playerId, coord });
  },
  hostForceAward: (playerId, amount) => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostForceAward, { code, playerId, amount });
  },
  hostForceRemove: (playerId, amount) => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostForceRemove, { code, playerId, amount });
  },
  hostEditTotal: (playerId, field, value) => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostEditTotal, { code, playerId, field, value });
  },
  hostEditInventory: (playerId, action, item) => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostEditInventory, { code, playerId, action, item });
  },
  hostLockPlayers: (locked) => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostLockPlayers, { code, locked });
  },
  hostUndo: () => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostUndo, { code });
  },
  hostKick: (playerId) => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostKick, { code, playerId });
  },
  hostExport: () => {
    const { code } = get();
    if (!code) return Promise.resolve({ error: 'No game' });
    const socket = getSocket();
    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.hostExport, { code }, (r: any) => resolve(r));
    });
  },
  addBot: () => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostAddBot, { code });
  },
  removeBot: (playerId) => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostRemoveBot, { code, playerId });
  },
  setTimerDuration: (seconds) => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostSetTimerDuration, { code, duration: seconds });
  },
  startTimer: () => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostStartTimer, { code });
  },
  pauseTimer: () => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostPauseTimer, { code });
  },
  resumeTimer: () => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostResumeTimer, { code });
  },
  stopTimer: () => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostStopTimer, { code });
  },
  resetGame: () => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.hostResetGame, { code });
  },
  setBoardLayout: (layout) => {
    const { code } = get();
    if (!code) return Promise.resolve({ error: 'No game' });
    const socket = getSocket();
    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.playerSetBoardLayout, { code, layout }, (r: any) => {
        resolve(r?.error ? { error: r.error } : { ok: true });
      });
    });
  },
  setReady: (ready) => {
    const { code } = get();
    if (code) getSocket().emit(CLIENT_EVENTS.playerSetReady, { code, ready });
  },

  sendReaction: (emoji) => {
    const { code } = get();
    if (!code) return;
    getSocket().emit(CLIENT_EVENTS.playerReact, { code, emoji });
  },

  pushToast: (t) => {
    const id = `local_${++toastId}`;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clearDefense: () => set({ defensePrompt: null }),
  reset: () => {
    // Clear any pending reaction timers so they don't fire after reset.
    const timers = get()._reactionTimers;
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    set({
      role: 'none',
      code: null,
      hostToken: null,
      playerName: null,
      hostState: null,
      playerState: null,
      spectatorState: null,
      defensePrompt: null,
      results: null,
      toasts: [],
      reactions: [],
      error: null,
      kicked: false,
      _reactionTimers: new Map(),
    });
    try {
      localStorage.removeItem('pirate-host');
      localStorage.removeItem('pirate-player');
    } catch {}
  },
}));
