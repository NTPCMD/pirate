// ============================================================================
// Pirate Game — Socket.IO server (mini-service on port 3003)
// Server-authoritative real-time game engine.
// ============================================================================

import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { GameStore, type TimerHooks } from './src/engine';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type DefenseChoice,
  type DefensePrompt,
  type HostGameState,
  type PlayerGameState,
  type PowerType,
  type GameResults,
  type Reaction,
  type SpectatorGameState,
  type SquareContent,
  isValidCoord,
} from '../../src/lib/pirate/types';

const db = new PrismaClient({ log: ['error'] });
const store = new GameStore(db);

const httpServer = createServer();
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 5 * 1024 * 1024,
});

// --- rate limiting ----------------------------------------------------------
const lastAction = new Map<string, number>();
const MIN_INTERVAL = 120; // ms
function rateLimited(socketId: string): boolean {
  const now = Date.now();
  const last = lastAction.get(socketId) ?? 0;
  if (now - last < MIN_INTERVAL) return true;
  lastAction.set(socketId, now);
  return false;
}

/**
 * Separate, looser rate limit for ephemeral quick reactions. Players can fire
 * at most one reaction every REACT_MIN_INTERVAL ms per socket — this stops
 * spam without feeling sluggish. Independent from the general action rate
 * limit so reaction taps don't throttle real game moves.
 */
const lastReact = new Map<string, number>();
const REACT_MIN_INTERVAL = 500; // ms
function reactRateLimited(socketId: string): boolean {
  const now = Date.now();
  const last = lastReact.get(socketId) ?? 0;
  if (now - last < REACT_MIN_INTERVAL) return true;
  lastReact.set(socketId, now);
  return false;
}

// --- helpers ----------------------------------------------------------------

function broadcastState(code: string) {
  const session = store.getGame(code);
  if (!session) return;
  // host
  if (session.hostSocketId) {
    const hostState: HostGameState = store.hostSnapshot(session);
    io.to(session.hostSocketId).emit(SERVER_EVENTS.state, { role: 'host', state: hostState });
  }
  // players (skip bots — they have no socket)
  for (const [pid, p] of session.players) {
    if (p.isBot) continue;
    const ps = store.playerSnapshot(session, pid);
    if (ps) {
      io.to(pid).emit(SERVER_EVENTS.state, { role: 'player', state: ps });
    }
  }
  // spectators — send a scrubbed read-only snapshot to every connected spectator
  if (session.spectators.size > 0) {
    const specState: SpectatorGameState = store.spectatorSnapshot(session);
    for (const sid of session.spectators.keys()) {
      io.to(sid).emit(SERVER_EVENTS.state, { role: 'spectator', state: specState });
    }
  }
}

/** Deliver a defense prompt to a human target. Bots are auto-resolved. */
function deliverDefensePrompt(session: ReturnType<typeof store.getGame>, targetId: string, prompt: DefensePrompt) {
  if (!session) return;
  const target = session.players.get(targetId);
  if (!target) return;
  if (target.isBot) {
    // bot target — auto-resolve after 1-2s
    const code = session.code;
    const promptId = prompt.promptId;
    setTimeout(() => {
      const s = store.getGame(code);
      if (!s) return;
      store.botResolveDefense(s, targetId, promptId, { onStateUpdate: () => broadcastState(code) });
    }, 1000 + Math.random() * 1000);
    return;
  }
  // human target — emit to socket
  io.to(targetId).emit(SERVER_EVENTS.defensePrompt, prompt);
}

function sendToast(socketId: string, toast: any) {
  io.to(socketId).emit(SERVER_EVENTS.toast, toast);
}

/**
 * Shared post-call handling for both manual host calls and timer auto-calls.
 * Emits the `coordinate-called` event, broadcasts the new state, and schedules
 * each bot's reveal of the just-called coordinate.
 */
function handleCoordinateCalled(code: string, coord: string) {
  const upper = coord.toUpperCase();
  io.to(code).emit(SERVER_EVENTS.coordinateCalled, { coord: upper });
  broadcastState(code);
  const s = store.getGame(code);
  if (!s) return;
  const bots = Array.from(s.players.values()).filter((pl) => pl.isBot);
  for (const bot of bots) {
    const delay = 800 + Math.random() * 1700; // 800-2500ms
    const botId = bot.id;
    setTimeout(() => {
      const sess = store.getGame(code);
      if (!sess || sess.status !== 'playing') return;
      store.botReveal(sess, botId, upper, {
        onStateUpdate: () => broadcastState(code),
        onDefensePrompt: (targetId, prompt) => {
          const cur = store.getGame(code);
          deliverDefensePrompt(cur, targetId, prompt);
        },
      });
    }, delay);
  }
}

/**
 * Round-timer hooks — broadcast state on every tick so the host + players see
 * the countdown update live, and run the standard coordinate-called pipeline
 * (room emit + broadcast + bot reveals) when the timer auto-calls a coord.
 */
function makeTimerHooks(): TimerHooks {
  return {
    onTick: (session) => broadcastState(session.code),
    onAutoCall: (session, coord) => handleCoordinateCalled(session.code, coord),
  };
}

io.on('connection', (socket) => {
  console.log(`[pirate] connected ${socket.id}`);

  socket.on(CLIENT_EVENTS.ping, () => {
    socket.emit(SERVER_EVENTS.pong, { t: Date.now() });
  });

  // --- HOST ----------------------------------------------------------------
  socket.on(CLIENT_EVENTS.hostCreate, async (payload: { hostName?: string }, ack?: (r: any) => void) => {
    try {
      const session = await store.createGame(payload?.hostName?.trim() || 'Host', socket.id);
      socket.join(session.code);
      const res = { code: session.code, hostToken: session.hostToken, hostName: session.hostName };
      socket.emit(SERVER_EVENTS.hostCreated, res);
      broadcastState(session.code);
      ack?.(res);
    } catch (e: any) {
      socket.emit(SERVER_EVENTS.error, { message: e?.message ?? 'Failed to create game' });
    }
  });

  socket.on('host:reconnect', (payload: { hostToken?: string }, ack?: (r: any) => void) => {
    const token = payload?.hostToken;
    if (!token) return ack?.({ error: 'Missing token' });
    const session = store.reconnectHost(token, socket.id);
    if (!session) return ack?.({ error: 'Game not found' });
    socket.join(session.code);
    broadcastState(session.code);
    ack?.({ ok: true, code: session.code });
  });

  socket.on(CLIENT_EVENTS.hostStart, (p: { code?: string }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    const r = store.startGame(s, makeTimerHooks());
    if (r.error) return sendToast(socket.id, { id: 'e', title: r.error, tone: 'bad' });
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostPause, (p: { code?: string }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    store.pauseGame(s);
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostResume, (p: { code?: string }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    store.resumeGame(s, makeTimerHooks());
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostCallCoord, (p: { code?: string; coord?: string }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    const coord = (p?.coord ?? '').trim();
    if (!isValidCoord(coord)) return sendToast(socket.id, { id: 'e', title: 'Invalid coordinate', tone: 'bad' });
    const r = store.callCoordinate(s, coord);
    if (r.error) return sendToast(socket.id, { id: 'e', title: r.error, tone: 'bad' });
    handleCoordinateCalled(s.code, coord);
  });

  socket.on(CLIENT_EVENTS.hostRevealAll, (p: { code?: string }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    store.revealAll(s);
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostRevealSquare, (p: { code?: string; playerId?: string; coord?: string }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    if (!p?.playerId || !p?.coord) return;
    store.revealSquareHost(s, p.playerId, p.coord);
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostForceAward, (p: { code?: string; playerId?: string; amount?: number }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    const amt = Math.max(0, Math.floor(Number(p?.amount) || 0));
    store.forceAward(s, p!.playerId!, amt);
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostForceRemove, (p: { code?: string; playerId?: string; amount?: number }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    const amt = Math.max(0, Math.floor(Number(p?.amount) || 0));
    store.forceRemove(s, p!.playerId!, amt);
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostEditTotal, (p: { code?: string; playerId?: string; field?: 'running' | 'banked'; value?: number }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    if (!p?.playerId || !p?.field) return;
    store.editTotal(s, p.playerId, p.field, Math.max(0, Math.floor(Number(p.value) || 0)));
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostEditInventory, (p: { code?: string; playerId?: string; action?: 'add' | 'remove'; item?: PowerType }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    if (!p?.playerId || !p?.action || !p?.item) return;
    store.editInventory(s, p.playerId, p.action, p.item);
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostLockPlayers, (p: { code?: string; locked?: boolean }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    store.setLocked(s, !!p?.locked);
    io.to(s.code).emit(SERVER_EVENTS.locked, { locked: !!p?.locked });
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostUndo, (p: { code?: string }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    const r = store.undo(s);
    if (r.error) return sendToast(socket.id, { id: 'e', title: r.error, tone: 'bad' });
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostKick, (p: { code?: string; playerId?: string }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    if (!p?.playerId) return;
    const target = s.players.get(p.playerId);
    // bots are removed completely; humans are marked disconnected for reconnect
    if (target?.isBot) {
      store.removeBot(s, p.playerId);
    } else {
      store.kickPlayer(s, p.playerId);
      io.to(p.playerId).emit(SERVER_EVENTS.kicked, { reason: 'Removed by host' });
    }
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostAddBot, (p: { code?: string; name?: string }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    const botCount = Array.from(s.players.values()).filter((pl) => pl.isBot).length;
    if (botCount >= 8) {
      return sendToast(socket.id, { id: 'e', title: 'Bot limit reached (8)', tone: 'bad' });
    }
    store.addBot(s, p?.name);
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostRemoveBot, (p: { code?: string; playerId?: string }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    if (!p?.playerId) return;
    store.removeBot(s, p.playerId);
    broadcastState(s.code);
  });

  // --- ROUND TIMER (auto-advance) -----------------------------------------
  socket.on(CLIENT_EVENTS.hostSetTimerDuration, (p: { code?: string; duration?: number }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    const r = store.setRoundTimerDuration(s, Number(p?.duration) || 0);
    if (r.error) return sendToast(socket.id, { id: 'e', title: r.error, tone: 'bad' });
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostStartTimer, (p: { code?: string }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    const r = store.startRoundTimer(s, makeTimerHooks());
    if (r.error) return sendToast(socket.id, { id: 'e', title: r.error, tone: 'bad' });
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostPauseTimer, (p: { code?: string }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    store.pauseRoundTimer(s);
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostResumeTimer, (p: { code?: string }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    const r = store.resumeRoundTimer(s, makeTimerHooks());
    if (r.error) return sendToast(socket.id, { id: 'e', title: r.error, tone: 'bad' });
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostStopTimer, (p: { code?: string }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    store.stopRoundTimer(s);
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.hostEnd, (p: { code?: string }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    const results: GameResults = store.endGame(s);
    io.to(s.code).emit(SERVER_EVENTS.gameEnded, results);
    broadcastState(s.code);
  });

  // --- HOST: reset game (same players, fresh boards) ----------------------
  // Triggered by the host's "Play Again" button on the end-game screen.
  // Server-authoritative: boards are regenerated here, never on the client.
  socket.on(CLIENT_EVENTS.hostResetGame, (p: { code?: string }) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return;
    const r = store.resetGame(s);
    if (r.error) {
      return sendToast(socket.id, { id: 'e', title: r.error, tone: 'bad' });
    }
    // Broadcast fresh state to host + every player + every spectator.
    broadcastState(s.code);
    // Tell every client to clear their local `results` so they route back
    // to the lobby view. The next state snapshot they just received already
    // reflects the new lobby status.
    io.to(s.code).emit(SERVER_EVENTS.gameReset, { code: s.code });
  });

  socket.on(CLIENT_EVENTS.hostExport, (p: { code?: string }, ack?: (r: any) => void) => {
    const s = store.getGame(p?.code ?? '');
    if (!s || s.hostSocketId !== socket.id) return ack?.({ error: 'Not authorized' });
    const snap = store.hostSnapshot(s);
    ack?.({ results: snap });
  });

  // --- SPECTATOR ------------------------------------------------------------
  socket.on(CLIENT_EVENTS.spectatorJoin, (p: { code?: string; name?: string }, ack?: (r: any) => void) => {
    const code = (p?.code ?? '').trim().toUpperCase();
    const name = (p?.name ?? '').trim();
    if (!code) return ack?.({ error: 'Game code required' });
    if (name.length > 20) return ack?.({ error: 'Name must be 1–20 characters' });
    const s = store.getGame(code);
    if (!s) return ack?.({ error: 'Game not found. Check the code.' });
    const r = store.joinSpectator(s, name || 'Spectator', socket.id);
    if ('error' in r) return ack?.({ error: r.error });
    socket.join(s.code);
    ack?.({ ok: true });
    // send initial snapshot directly to the joining spectator
    const specState = store.spectatorSnapshot(s);
    io.to(socket.id).emit(SERVER_EVENTS.state, { role: 'spectator', state: specState });
    // broadcast so host sees updated spectator count + activity feed propagates
    broadcastState(s.code);
  });

  // --- PLAYER --------------------------------------------------------------
  socket.on(CLIENT_EVENTS.playerJoin, async (p: { code?: string; name?: string }, ack?: (r: any) => void) => {
    const code = (p?.code ?? '').trim().toUpperCase();
    const name = (p?.name ?? '').trim();
    if (!code) return ack?.({ error: 'Game code required' });
    if (!name || name.length < 1 || name.length > 20) return ack?.({ error: 'Name must be 1–20 characters' });
    const r = await store.joinPlayer(code, name, socket.id);
    if ('error' in r) {
      ack?.({ error: r.error });
      return;
    }
    socket.join(r.session.code);
    ack?.({ ok: true, reconnected: r.reconnected });
    broadcastState(r.session.code);
  });

  socket.on(CLIENT_EVENTS.playerSetBoardLayout, (p: { code?: string; layout?: SquareContent[] }, ack?: (r: any) => void) => {
    const s = store.getGame((p?.code ?? '').trim().toUpperCase());
    if (!s) return ack?.({ error: 'Game not found' });
    if (!p?.layout || !Array.isArray(p.layout)) return ack?.({ error: 'Invalid layout' });
    const r = store.setBoardLayout(s, socket.id, p.layout);
    if (r.error) return ack?.({ error: r.error });
    ack?.({ ok: true });
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.playerSetReady, (p: { code?: string; ready?: boolean }, ack?: (r: any) => void) => {
    const s = store.getGame((p?.code ?? '').trim().toUpperCase());
    if (!s) return ack?.({ error: 'Game not found' });
    const r = store.setPlayerReady(s, socket.id, !!p?.ready);
    if (r.error) return ack?.({ error: r.error });
    ack?.({ ok: true });
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.playerReveal, (p: { code?: string; coord?: string }, ack?: (r: any) => void) => {
    if (rateLimited(socket.id)) return ack?.({ error: 'Too fast' });
    const s = store.getGame((p?.code ?? '').trim().toUpperCase());
    if (!s) return ack?.({ error: 'Game not found' });
    const coord = (p?.coord ?? '').trim();
    const r = store.revealSquare(s, socket.id, coord);
    if (r.error) {
      ack?.({ error: r.error });
      return;
    }
    ack?.({ ok: true });
    if (r.toast) sendToast(socket.id, r.toast);
    broadcastState(s.code);
  });

  socket.on(CLIENT_EVENTS.playerSelectTarget, (p: { code?: string; powerType?: PowerType; targetId?: string }, ack?: (r: any) => void) => {
    if (rateLimited(socket.id)) return ack?.({ error: 'Too fast' });
    const s = store.getGame((p?.code ?? '').trim().toUpperCase());
    if (!s) return ack?.({ error: 'Game not found' });
    if (!p?.powerType || !p?.targetId) return ack?.({ error: 'Missing target' });
    const r = store.selectTarget(s, socket.id, p.powerType, p.targetId);
    if (r.error) return ack?.({ error: r.error });
    if (r.pendingDefense) {
      // deliver prompt to target (human socket OR auto-resolve if target is a bot)
      deliverDefensePrompt(s, p.targetId, r.pendingDefense);
      ack?.({ ok: true, pending: true });
    } else {
      ack?.({ ok: true, resolved: true });
      broadcastState(s.code);
    }
  });

  socket.on(CLIENT_EVENTS.playerDefenseChoice, (p: { code?: string; promptId?: string; choice?: DefenseChoice }, ack?: (r: any) => void) => {
    const s = store.getGame((p?.code ?? '').trim().toUpperCase());
    if (!s) return ack?.({ error: 'Game not found' });
    if (!p?.promptId || !p?.choice) return ack?.({ error: 'Missing choice' });
    const r = store.resolveDefense(s, socket.id, p.promptId, p.choice);
    if (r.error) return ack?.({ error: r.error });
    ack?.({ ok: true });
    broadcastState(s.code);
  });

  // --- QUICK REACTIONS (ephemeral emoji broadcast) -------------------------
  // Any role in the game (host, player, or spectator) can fire a quick emoji
  // reaction. We look up the sender's display name based on their role, push
  // the reaction through the engine (which validates the emoji against the
  // fixed palette), and broadcast it to everyone in the room. Reactions are
  // NOT persisted to the activity log or DB — pure real-time flair.
  socket.on(CLIENT_EVENTS.playerReact, (p: { code?: string; emoji?: string }, ack?: (r: any) => void) => {
    if (reactRateLimited(socket.id)) {
      return ack?.({ error: 'Too fast — wait a moment before reacting again.' });
    }
    const code = (p?.code ?? '').trim().toUpperCase();
    const emoji = (p?.emoji ?? '').trim();
    const s = store.getGame(code);
    if (!s) return ack?.({ error: 'Game not found' });
    if (!emoji) return ack?.({ error: 'Missing emoji' });

    // Resolve the sender's display name by role.
    let senderName = '';
    if (s.hostSocketId === socket.id) {
      senderName = s.hostName;
    } else if (s.players.has(socket.id)) {
      senderName = s.players.get(socket.id)!.name;
    } else if (s.spectators.has(socket.id)) {
      senderName = s.spectators.get(socket.id)!.name;
    } else {
      return ack?.({ error: 'Not in this game' });
    }

    const reaction: Reaction | null = store.addReaction(s, senderName, emoji);
    if (!reaction) return ack?.({ error: 'Invalid emoji' });
    ack?.({ ok: true });
    // Broadcast to EVERYONE in the room — host, players, and spectators all
    // see the floating reaction in real time.
    io.to(s.code).emit(SERVER_EVENTS.reaction, reaction);
  });

  // --- CHAT -----------------------------------------------------------------
  const lastChat = new Map<string, number>();
  socket.on(CLIENT_EVENTS.playerChat, (p: { code?: string; text?: string }, ack?: (r: any) => void) => {
    const now = Date.now();
    const last = lastChat.get(socket.id) ?? 0;
    if (now - last < 500) return ack?.({ error: 'Too fast' });
    lastChat.set(socket.id, now);

    const code = (p?.code ?? '').trim().toUpperCase();
    const text = (p?.text ?? '').trim();
    const s = store.getGame(code);
    if (!s) return ack?.({ error: 'Game not found' });
    if (!text) return ack?.({ error: 'Empty message' });

    // Resolve sender name + role.
    let senderName = '';
    let role: 'host' | 'player' | 'spectator' = 'player';
    if (s.hostSocketId === socket.id) {
      senderName = s.hostName;
      role = 'host';
    } else if (s.players.has(socket.id)) {
      senderName = s.players.get(socket.id)!.name;
      role = 'player';
    } else if (s.spectators.has(socket.id)) {
      senderName = s.spectators.get(socket.id)!.name;
      role = 'spectator';
    } else {
      return ack?.({ error: 'Not in this game' });
    }

    const msg = store.addChatMessage(s, senderName, role, text);
    if (!msg) return ack?.({ error: 'Invalid message' });
    ack?.({ ok: true });
    io.to(s.code).emit(SERVER_EVENTS.chat, msg);
  });

  // --- disconnect ----------------------------------------------------------
  socket.on('disconnect', () => {
    console.log(`[pirate] disconnected ${socket.id}`);
    store.disconnectPlayer(socket.id);
    // tidy up rate-limit maps so they don't grow unbounded over long uptimes
    lastAction.delete(socket.id);
    lastReact.delete(socket.id);
    // broadcast updates for any games this socket was in
    // (store already logged; find games and broadcast)
    for (const code of socket.rooms) {
      if (code !== socket.id) broadcastState(code);
    }
  });

  socket.on('error', (err) => {
    console.error(`[pirate] socket error ${socket.id}:`, err);
  });
});

const PORT = 3003;
httpServer.listen(PORT, () => {
  console.log(`[pirate] Pirate Game socket server running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('[pirate] SIGTERM, shutting down...');
  httpServer.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('[pirate] SIGINT, shutting down...');
  httpServer.close(() => process.exit(0));
});
