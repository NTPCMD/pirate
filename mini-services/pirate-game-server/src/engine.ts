// ============================================================================
// Pirate Game Engine — server-authoritative game state + logic
// Lives in the socket.io mini-service. Holds all real-time state in memory
// and persists key events / results to SQLite via Prisma.
// ============================================================================

import type {
  ActivityEvent,
  AwardResult,
  Board,
  CashValue,
  DefenseChoice,
  DefensePrompt,
  GameResults,
  GameStatus,
  HostGameState,
  InventoryItem,
  Player,
  PlayerGameState,
  PlayerHistoryEntry,
  PlayerStats,
  PowerType,
  CashContent,
  PowerContent,
  EmptyContent,
  PaletteEntry,
  Reaction,
  ChatMessage,
  SpectatorGameState,
  Square,
  SquareContent,
  ToastPayload,
  UndoEntry,
} from '../../../src/lib/pirate/types';
import {
  ALLOWED_REACTION_EMOJI,
  BOARD_PALETTE,
  CASH_DISTRIBUTION,
  COLUMNS,
  BOARD_SIZE,
  POWER_DISTRIBUTION,
  POWERS,
  emptyStats,
  indexToCoord,
  isValidCoord,
} from '../../../src/lib/pirate/types';
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Board generation
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateBoard(): Board {
  const contents: SquareContent[] = [
    ...CASH_DISTRIBUTION.map((v): CashContent => ({ kind: 'cash', value: v })),
    ...POWER_DISTRIBUTION.map((p): PowerContent => ({ kind: 'power', power: p })),
  ];
  // 90 + 10 = 100 ✓
  const shuffled = shuffle(contents);
  const board: Board = [];
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
    const coord = indexToCoord(i);
    board.push({ coord, content: shuffled[i], revealed: false });
  }
  return board;
}

// Empty board for human players to customize before the game starts.
export function generateEmptyBoard(): Board {
  const board: Board = [];
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
    const coord = indexToCoord(i);
    board.push({ coord, content: { kind: 'empty' } as EmptyContent, revealed: false });
  }
  return board;
}

// Fill any empty squares on a board randomly from the standard palette.
// Used when the host starts the game and a player hasn't finished customizing.
export function fillEmptySquares(board: Board): Board {
  // Collect what's already placed
  const placedCash = new Map<number, number>();
  const placedPowers = new Set<PowerType>();
  for (const sq of board) {
    if (sq.content.kind === 'cash') {
      placedCash.set(sq.content.value, (placedCash.get(sq.content.value) ?? 0) + 1);
    } else if (sq.content.kind === 'power') {
      placedPowers.add(sq.content.power);
    }
  }
  // Build the remaining palette
  const remaining: SquareContent[] = [];
  for (const entry of BOARD_PALETTE) {
    if (entry.kind === 'cash') {
      const placed = placedCash.get(entry.value!) ?? 0;
      const need = Math.max(0, entry.count - placed);
      for (let i = 0; i < need; i++) {
        remaining.push({ kind: 'cash', value: entry.value! } as CashContent);
      }
    } else {
      if (!placedPowers.has(entry.power!)) {
        remaining.push({ kind: 'power', power: entry.power! } as PowerContent);
      }
    }
  }
  const shuffled = shuffle(remaining);
  let idx = 0;
  return board.map((sq) => {
    if (sq.content.kind === 'empty' && idx < shuffled.length) {
      return { ...sq, content: shuffled[idx++] };
    }
    return sq;
  });
}

// ---------------------------------------------------------------------------
// Game + Player factories
// ---------------------------------------------------------------------------

export interface SpectatorEntry {
  id: string; // socket id
  name: string;
  joinedAt: number;
  connected: boolean;
}

export interface GameSession {
  code: string;
  hostToken: string;
  hostName: string;
  hostSocketId: string | null;
  status: GameStatus;
  players: Map<string, Player>; // key: player id (socket id)
  nameIndex: Map<string, string>; // lowercased name -> player id (for reconnect)
  spectators: Map<string, SpectatorEntry>; // key: spectator socket id
  activity: ActivityEvent[];
  undoStack: UndoEntry[];
  currentCoord?: string;
  calledCoordinates: string[];
  locked: boolean;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  pendingDefenses: Map<string, PendingDefense>;
  dbGameId?: string;
  /**
   * Ephemeral quick-reaction feed. NOT persisted and NOT included in the
   * full state snapshots — reactions are pushed to clients in real time via
   * a dedicated `reaction` event. Kept capped at the most recent 20 so a
   * late-joining client could in principle re-render the backlog, though by
   * spec clients only animate reactions that arrive after they connect.
   */
  reactions: Reaction[];
  chatMessages: ChatMessage[];
  roundTimer?: {
    duration: number; // seconds (0 = off, otherwise 5–60)
    remaining: number; // seconds left in current cycle
    active: boolean; // is the countdown currently running?
    intervalId?: NodeJS.Timeout | null;
  };
}

/**
 * Hooks the socket layer wires into the round timer so the engine can broadcast
 * state on every tick and when a coordinate is auto-called. The engine itself
 * stays socket-agnostic — it just asks the hooks to "push the snapshot out".
 */
export interface TimerHooks {
  onTick: (session: GameSession) => void;
  onAutoCall: (session: GameSession, coord: string) => void;
}

export interface PendingDefense {
  prompt: DefensePrompt;
  attackerId: string;
  targetId: string;
  powerType: PowerType;
  amount?: number;
}

function makePlayer(
  id: string,
  name: string,
  gameCode: string,
  isHost: boolean,
  isBot = false,
): Player {
  return {
    id,
    name,
    gameCode,
    board: isBot ? generateBoard() : generateEmptyBoard(),
    runningTotal: 0,
    bankedTotal: 0,
    inventory: [],
    connected: true,
    joinedAt: Date.now(),
    history: [],
    stats: emptyStats(),
    isHost,
    isBot,
    boardLocked: false,
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

let idCounter = 0;
function uid(prefix = 'id'): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

// Pirate-themed bot name pool. addBot picks a unique unused name from here.
const BOT_NAMES = [
  'Bot Parrot',
  'Bot Kraken',
  'Bot Barnacle',
  'Bot Squid',
  'Bot Marooner',
  'Bot Cutlass',
  'Bot Grog',
  'Bot Davy',
  'Bot Plank',
  'Bot Doubloon',
];

function genGameCode(): string {
  // 6-char uppercase alphanumeric, avoid ambiguous chars
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function genToken(): string {
  return uid('tok') + uid('sec');
}

function snapshotPlayers(players: Player[]): UndoEntry['snapshots'] {
  const out: UndoEntry['snapshots'] = {};
  for (const p of players) {
    out[p.id] = {
      runningTotal: p.runningTotal,
      bankedTotal: p.bankedTotal,
      inventory: p.inventory.map((i) => ({ ...i })),
      stats: { ...p.stats },
    };
  }
  return out;
}

function pushHistory(
  p: Player,
  entry: Omit<PlayerHistoryEntry, 'at'>,
) {
  p.history.unshift({ ...entry, at: Date.now() });
  if (p.history.length > 60) p.history.pop();
}

// ---------------------------------------------------------------------------
// Game Store
// ---------------------------------------------------------------------------

export class GameStore {
  private games = new Map<string, GameSession>();
  private db: PrismaClient | null;
  private sweeper: NodeJS.Timeout | null = null;

  constructor(db?: PrismaClient) {
    this.db = db ?? null;
    // Sweep expired defense prompts every 1s
    this.sweeper = setInterval(() => this.sweepDefenses(), 1000);
  }

  // --- create / lookup -----------------------------------------------------

  async createGame(hostName: string, hostSocketId: string) {
    let code = genGameCode();
    while (this.games.has(code)) code = genGameCode();
    const token = genToken();
    const session: GameSession = {
      code,
      hostToken: token,
      hostName: hostName || 'Host',
      hostSocketId,
      status: 'lobby',
      players: new Map(),
      nameIndex: new Map(),
      spectators: new Map(),
      activity: [],
      undoStack: [],
      calledCoordinates: [],
      locked: false,
      createdAt: Date.now(),
      pendingDefenses: new Map(),
      reactions: [],
      chatMessages: [],
    };
    let dbGameId: string | undefined;
    try {
      if (this.db) {
        const g = await this.db.game.create({
          data: { code, status: 'lobby', hostName: session.hostName, hostToken: token },
        });
        dbGameId = g.id;
      }
    } catch (e) {
      console.error('[pirate] db create game failed', e);
    }
    session.dbGameId = dbGameId;
    this.games.set(code, session);
    this.logActivity(session, {
      type: 'system',
      message: `${session.hostName} created game ${code}`,
      tone: 'info',
    });
    return session;
  }

  getGame(code: string): GameSession | undefined {
    return this.games.get(code.toUpperCase());
  }

  getGameByHostToken(token: string): GameSession | undefined {
    for (const g of this.games.values()) if (g.hostToken === token) return g;
    return undefined;
  }

  // --- host reconnect ------------------------------------------------------

  reconnectHost(token: string, socketId: string): GameSession | undefined {
    const g = this.getGameByHostToken(token);
    if (!g) return undefined;
    g.hostSocketId = socketId;
    return g;
  }

  // --- player join / reconnect --------------------------------------------

  async joinPlayer(
    code: string,
    name: string,
    socketId: string,
  ): Promise<{ session: GameSession; player: Player; reconnected: boolean } | { error: string }> {
    const session = this.getGame(code);
    if (!session) return { error: 'Game not found. Check the code.' };
    if (session.status === 'ended') return { error: 'This game has already ended.' };

    // Reconnect by name
    const key = name.trim().toLowerCase();
    const existingId = session.nameIndex.get(key);
    if (existingId) {
      const existing = session.players.get(existingId);
      if (existing) {
        existing.id = socketId;
        existing.connected = true;
        session.players.delete(existingId);
        session.players.set(socketId, existing);
        session.nameIndex.set(key, socketId);
        this.logActivity(session, {
          type: 'player-reconnected',
          message: `${existing.name} reconnected`,
          actor: existing.name,
          tone: 'good',
        });
        return { session, player: existing, reconnected: true };
      }
    }

    // Name uniqueness
    for (const p of session.players.values()) {
      if (p.name.trim().toLowerCase() === key) {
        return { error: 'That name is taken in this game. Pick another.' };
      }
    }

    if (session.locked) return { error: 'The host has locked new players from joining.' };

    const player = makePlayer(socketId, name.trim(), code, false);
    session.players.set(socketId, player);
    session.nameIndex.set(key, socketId);

    try {
      if (this.db && session.dbGameId) {
        await this.db.player.create({
          data: {
            gameId: session.dbGameId,
            name: player.name,
            connected: true,
          },
        });
      }
    } catch (e) {
      console.error('[pirate] db player create failed', e);
    }

    this.logActivity(session, {
      type: 'player-joined',
      message: `${player.name} joined the game`,
      actor: player.name,
      tone: 'good',
    });
    return { session, player, reconnected: false };
  }

  disconnectPlayer(socketId: string) {
    for (const session of this.games.values()) {
      // spectator disconnect — remove entirely (spectators re-join manually)
      if (session.spectators.has(socketId)) {
        const sp = session.spectators.get(socketId);
        session.spectators.delete(socketId);
        if (sp) {
          this.logActivity(session, {
            type: 'player-left',
            message: `${sp.name} stopped spectating`,
            actor: sp.name,
            tone: 'info',
            meta: { spectator: true },
          });
        }
        continue;
      }
      const p = session.players.get(socketId);
      if (p) {
        p.connected = false;
        this.logActivity(session, {
          type: 'player-left',
          message: `${p.name} disconnected`,
          actor: p.name,
          tone: 'bad',
        });
        // keep state for reconnect; do not delete
      }
      if (session.hostSocketId === socketId) {
        session.hostSocketId = null;
        // Pause the round timer while the host is gone so auto-calls don't
        // pile up against an unwatched session.
        this.pauseRoundTimer(session);
        this.logActivity(session, {
          type: 'system',
          message: `Host disconnected — game paused until host returns`,
          tone: 'info',
        });
      }
    }
  }

  kickPlayer(session: GameSession, playerId: string) {
    const p = session.players.get(playerId);
    if (!p) return;
    p.connected = false;
    session.nameIndex.delete(p.name.trim().toLowerCase());
    this.logActivity(session, {
      type: 'system',
      message: `${p.name} was removed by the host`,
      tone: 'bad',
    });
  }

  // --- bots / AI players ----------------------------------------------------

  addBot(session: GameSession, name?: string): Player {
    const used = new Set(
      Array.from(session.players.values()).map((p) => p.name),
    );
    let botName = (name ?? '').trim();
    if (!botName) {
      const available = BOT_NAMES.filter((n) => !used.has(n));
      botName =
        available.length > 0
          ? available[Math.floor(Math.random() * available.length)]
          : `Bot ${Math.random().toString(36).slice(2, 8)}`;
    }
    // ensure uniqueness even when caller provides a name
    let finalName = botName;
    let suffix = 1;
    while (used.has(finalName)) {
      finalName = `${botName} ${suffix}`;
      suffix += 1;
    }

    const id = `bot_${uid('bot')}`;
    const player = makePlayer(id, finalName, session.code, false, true);
    player.isBot = true;
    player.connected = true;
    session.players.set(id, player);
    session.nameIndex.set(finalName.trim().toLowerCase(), id);

    try {
      if (this.db && session.dbGameId) {
        void this.db.player.create({
          data: { gameId: session.dbGameId, name: finalName, connected: true },
        });
      }
    } catch (e) {
      console.error('[pirate] db bot create failed', e);
    }

    this.logActivity(session, {
      type: 'player-joined',
      message: `${finalName} joined the game`,
      actor: finalName,
      tone: 'good',
      meta: { bot: true },
    });
    return player;
  }

  removeBot(session: GameSession, playerId: string): void {
    const p = session.players.get(playerId);
    if (!p || !p.isBot) return;
    session.players.delete(playerId);
    session.nameIndex.delete(p.name.trim().toLowerCase());
    this.logActivity(session, {
      type: 'system',
      message: `${p.name} was removed by the host`,
      actor: p.name,
      tone: 'bad',
      meta: { bot: true },
    });
  }

  /** Pick a target for a bot — non-bot, non-self. Anchor prefers the richest. */
  botPickTarget(
    session: GameSession,
    botId: string,
    powerType: PowerType,
  ): string | null {
    const candidates = Array.from(session.players.values()).filter(
      (p) => p.id !== botId && !p.isBot,
    );
    if (candidates.length === 0) return null;
    if (powerType === 'anchor') {
      candidates.sort((a, b) => b.runningTotal - a.runningTotal);
      return candidates[0].id;
    }
    return candidates[Math.floor(Math.random() * candidates.length)].id;
  }

  /**
   * Reveal a coordinate for a bot. If a targeting power is revealed, schedule
   * an automatic target selection after 1–2s. Hooks let the caller broadcast
   * state changes and deliver defense prompts to human sockets.
   */
  botReveal(
    session: GameSession,
    botId: string,
    coord: string,
    hooks: {
      onStateUpdate: () => void;
      onDefensePrompt: (targetId: string, prompt: DefensePrompt) => void;
    },
  ): { error?: string; revealed?: boolean } {
    const bot = session.players.get(botId);
    if (!bot || !bot.isBot) return { error: 'Not a bot' };

    const r = this.revealSquare(session, botId, coord);
    if (r.error) return { error: r.error };
    hooks.onStateUpdate();

    // If a targeting power was just revealed, auto-select a target after a delay.
    const square = bot.board.find((s) => s.coord === coord.toUpperCase());
    if (square && square.content.kind === 'power') {
      const meta = POWERS[square.content.power];
      if (meta.targeting) {
        const powerType = square.content.power;
        const code = session.code;
        const delay = 1000 + Math.random() * 1000;
        setTimeout(() => {
          const sess = this.getGame(code);
          if (!sess || sess.status !== 'playing') return;
          const b = sess.players.get(botId);
          if (!b || !b.isBot) return;
          const targetId = this.botPickTarget(sess, botId, powerType);
          if (!targetId) return;
          const result = this.selectTarget(sess, botId, powerType, targetId);
          if (result.error) return;
          if (result.pendingDefense) {
            const target = sess.players.get(targetId);
            if (target?.isBot) {
              // bot vs bot — auto-resolve the defense too
              const promptId = result.pendingDefense.promptId;
              setTimeout(() => {
                const s2 = this.getGame(code);
                if (!s2) return;
                this.botResolveDefense(s2, targetId, promptId, hooks);
              }, 1000 + Math.random() * 1000);
            } else {
              // bot vs human — deliver the defense prompt to the human socket
              hooks.onDefensePrompt(targetId, result.pendingDefense);
            }
          }
          hooks.onStateUpdate();
        }, delay);
      }
    }

    return { revealed: true };
  }

  /** Auto-resolve a defense prompt where the bot is the target. */
  botResolveDefense(
    session: GameSession,
    botId: string,
    promptId: string,
    hooks: { onStateUpdate: () => void },
  ): { error?: string; resolved?: boolean } {
    const bot = session.players.get(botId);
    if (!bot || !bot.isBot) return { error: 'Not a bot' };

    const pending = session.pendingDefenses.get(promptId);
    if (!pending) return { error: 'Defense prompt expired' };
    if (pending.targetId !== botId) return { error: 'Not your defense prompt' };

    const hasShield = bot.inventory.some((i) => i.type === 'shield');
    const hasMirror = bot.inventory.some((i) => i.type === 'mirror');

    let choice: DefenseChoice = 'take';
    if (hasMirror) {
      // 60% mirror, 40% shield (if available), else take
      const r = Math.random();
      if (r < 0.6) choice = 'mirror';
      else if (hasShield) choice = 'shield';
    } else if (hasShield) {
      // 70% shield, 30% take
      if (Math.random() < 0.7) choice = 'shield';
    }

    const result = this.resolveDefense(session, botId, promptId, choice);
    if (result.error) return { error: result.error };
    hooks.onStateUpdate();
    return { resolved: true };
  }

  // --- spectators -----------------------------------------------------------

  /**
   * Add a spectator to a session. Spectators have no board, no money, and no
   * powers — they only observe. Returns the spectator entry or an error.
   */
  joinSpectator(
    session: GameSession,
    name: string,
    socketId: string,
  ): { spectator: SpectatorEntry } | { error: string } {
    if (session.status === 'ended') return { error: 'This game has already ended.' };
    const trimmed = name.trim() || 'Spectator';
    const entry: SpectatorEntry = {
      id: socketId,
      name: trimmed,
      joinedAt: Date.now(),
      connected: true,
    };
    session.spectators.set(socketId, entry);
    this.logActivity(session, {
      type: 'player-joined',
      message: `${trimmed} joined as spectator`,
      actor: trimmed,
      tone: 'info',
      meta: { spectator: true },
    });
    return { spectator: entry };
  }

  /** Mark a spectator disconnected (and remove — spectators re-join manually). */
  disconnectSpectator(session: GameSession, socketId: string): void {
    const sp = session.spectators.get(socketId);
    if (!sp) return;
    session.spectators.delete(socketId);
    this.logActivity(session, {
      type: 'player-left',
      message: `${sp.name} stopped spectating`,
      actor: sp.name,
      tone: 'info',
      meta: { spectator: true },
    });
  }

  // --- quick reactions (ephemeral) -----------------------------------------

  /**
   * Validate + record a quick emoji reaction. The reaction is added to
   * `session.reactions` (capped at the last 20) and the resulting object is
   * returned so the socket layer can broadcast it to the whole room via the
   * dedicated `reaction` event. Reactions are NOT logged to the activity feed
   * or persisted to the DB — they are pure real-time flair.
   *
   * Returns `null` if the emoji is not in the allowed palette.
   */
  addReaction(
    session: GameSession,
    playerName: string,
    emoji: string,
  ): Reaction | null {
    if (!ALLOWED_REACTION_EMOJI.has(emoji)) return null;
    const reaction: Reaction = {
      id: uid('react'),
      emoji,
      playerName: (playerName || 'Pirate').slice(0, 24),
      at: Date.now(),
    };
    session.reactions.push(reaction);
    // Trim to the most recent 20 so the array stays bounded.
    if (session.reactions.length > 20) {
      session.reactions.splice(0, session.reactions.length - 20);
    }
    return reaction;
  }

  addChatMessage(
    session: GameSession,
    playerName: string,
    role: 'host' | 'player' | 'spectator',
    text: string,
  ): ChatMessage | null {
    const clean = text.trim().slice(0, 200);
    if (!clean) return null;
    const msg: ChatMessage = {
      id: uid('chat'),
      playerName: (playerName || 'Pirate').slice(0, 24),
      role,
      text: clean,
      at: Date.now(),
    };
    session.chatMessages.push(msg);
    // Keep the last 50 messages.
    if (session.chatMessages.length > 50) {
      session.chatMessages.splice(0, session.chatMessages.length - 50);
    }
    return msg;
  }

  /**
   * Build a read-only snapshot for a spectator. Same shape as the host snapshot
   * BUT every player's board is SCRUBBED: hidden squares have their `content`
   * replaced with a harmless `{ kind: 'cash', value: 0 }` placeholder so the
   * spectator can never see what's hidden. Only revealed squares keep their
   * real content. The spectator list is included so spectators can see who
   * else is watching.
   */
  spectatorSnapshot(session: GameSession): SpectatorGameState {
    return {
      code: session.code,
      status: session.status,
      hostName: session.hostName,
      currentCoord: session.currentCoord,
      calledCoordinates: session.calledCoordinates,
      locked: session.locked,
      players: Array.from(session.players.values()).map((p) => this.scrubPlayerForSpectator(p)),
      activity: session.activity.slice(-200),
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      spectators: Array.from(session.spectators.values()).map((s) => ({
        id: s.id,
        name: s.name,
        joinedAt: s.joinedAt,
        connected: s.connected,
      })),
    };
  }

  /**
   * Returns a player snapshot for spectator consumption: same as `scrubPlayer`
   * but the board is SCRUBBED so hidden squares have their `content` redacted
   * to `{ kind: 'cash', value: 0 }`. The `revealed` flag is preserved (so the
   * spectator UI knows which squares are still hidden vs revealed).
   */
  private scrubPlayerForSpectator(p: Player): Player {
    const HIDDEN_PLACEHOLDER: SquareContent = { kind: 'cash', value: 0 as CashValue };
    return {
      ...p,
      board: p.board.map((s) => ({
        ...s,
        content: s.revealed ? s.content : HIDDEN_PLACEHOLDER,
      })),
      inventory: p.inventory.map((i) => ({ ...i })),
      history: p.history.map((h) => ({ ...h })),
      stats: { ...p.stats },
    };
  }

  // --- round timer (auto-advance) ------------------------------------------

  /**
   * Configure the round timer. Pass 0 to disable, or a value in [5, 60] seconds.
   * Calling this resets remaining to the full duration and stops any running
   * interval — useful when the host changes the duration mid-game.
   */
  setRoundTimerDuration(session: GameSession, seconds: number): { error?: string } {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    if (s !== 0 && (s < 5 || s > 60)) {
      return { error: 'Timer duration must be 0 (off) or 5–60 seconds' };
    }
    // Clear any running interval first.
    this.clearTimerInterval(session);
    session.roundTimer = {
      duration: s,
      remaining: s,
      active: false,
      intervalId: null,
    };
    return {};
  }

  /**
   * Pick a random coordinate from the full A1–J10 grid that has NOT yet been
   * called. Returns null if every coordinate has been called.
   */
  private pickUncalledCoord(session: GameSession): string | null {
    if (session.calledCoordinates.length >= BOARD_SIZE * BOARD_SIZE) return null;
    const called = new Set(session.calledCoordinates);
    const pool: string[] = [];
    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
      const coord = indexToCoord(i);
      if (!called.has(coord)) pool.push(coord);
    }
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** Internal: clear the interval and null the id. Safe to call anytime. */
  private clearTimerInterval(session: GameSession) {
    if (session.roundTimer?.intervalId) {
      clearInterval(session.roundTimer.intervalId);
      session.roundTimer.intervalId = null;
    }
  }

  /**
   * Start the round timer countdown. Each second, decrement `remaining`.
   * When it hits 0, auto-call a random uncalled coordinate (via callCoordinate),
   * log the activity, fire onAutoCall, then reset remaining to duration and
   * continue. If all 100 coords have been called, stop the timer.
   */
  startRoundTimer(session: GameSession, hooks: TimerHooks): { error?: string } {
    if (!session.roundTimer || session.roundTimer.duration <= 0) {
      return { error: 'No round timer configured' };
    }
    if (session.status !== 'playing') {
      return { error: 'Game is not active' };
    }
    // Don't double-start.
    this.clearTimerInterval(session);
    session.roundTimer.active = true;
    session.roundTimer.remaining = session.roundTimer.duration;

    const tick = () => {
      // Re-read the session in case it was deleted between scheduling and firing.
      const cur = this.games.get(session.code);
      if (!cur || !cur.roundTimer) {
        this.clearTimerInterval(session);
        return;
      }
      if (cur.status !== 'playing') {
        // Game paused/ended mid-tick — pause the timer without firing.
        this.pauseRoundTimer(cur);
        return;
      }
      cur.roundTimer.remaining -= 1;
      if (cur.roundTimer.remaining <= 0) {
        // Time to auto-call.
        const coord = this.pickUncalledCoord(cur);
        if (!coord) {
          // All 100 coords have been called — stop the timer.
          this.stopRoundTimer(cur);
          this.logActivity(cur, {
            type: 'system',
            message: `All coordinates called!`,
            tone: 'epic',
          });
          hooks.onTick(cur);
          return;
        }
        // Use callCoordinate so the existing pipeline (broadcast, bot reveals,
        // history logging) kicks in. The auto-call uses the same code path as
        // a manual call, which means the timer's remaining will be reset to
        // duration inside callCoordinate (since the timer is active).
        const r = this.callCoordinate(cur, coord);
        if (r.error) {
          // Fallback: log + stop so we don't spin forever.
          this.logActivity(cur, {
            type: 'system',
            message: `Timer auto-call failed: ${r.error}`,
            tone: 'bad',
          });
          this.stopRoundTimer(cur);
          hooks.onTick(cur);
          return;
        }
        this.logActivity(cur, {
          type: 'coordinate-called',
          message: `Timer auto-called ${coord}`,
          tone: 'epic',
          meta: { coord, auto: true },
        });
        // Reset the cycle for the next call.
        if (cur.roundTimer) cur.roundTimer.remaining = cur.roundTimer.duration;
        hooks.onAutoCall(cur, coord);
        return;
      }
      hooks.onTick(cur);
    };

    session.roundTimer.intervalId = setInterval(tick, 1000);
    return {};
  }

  /** Pause the timer — keeps remaining, just stops the interval. */
  pauseRoundTimer(session: GameSession): { error?: string } {
    if (!session.roundTimer || session.roundTimer.duration <= 0) {
      return { error: 'No round timer configured' };
    }
    this.clearTimerInterval(session);
    if (session.roundTimer) session.roundTimer.active = false;
    return {};
  }

  /** Resume the timer from its current remaining value. */
  resumeRoundTimer(session: GameSession, hooks: TimerHooks): { error?: string } {
    if (!session.roundTimer || session.roundTimer.duration <= 0) {
      return { error: 'No round timer configured' };
    }
    if (session.status !== 'playing') {
      return { error: 'Game is not active' };
    }
    if (session.roundTimer.active) return {}; // already running
    this.clearTimerInterval(session);
    session.roundTimer.active = true;
    if (session.roundTimer.remaining <= 0) {
      session.roundTimer.remaining = session.roundTimer.duration;
    }

    const tick = () => {
      const cur = this.games.get(session.code);
      if (!cur || !cur.roundTimer) {
        this.clearTimerInterval(session);
        return;
      }
      if (cur.status !== 'playing') {
        this.pauseRoundTimer(cur);
        return;
      }
      cur.roundTimer.remaining -= 1;
      if (cur.roundTimer.remaining <= 0) {
        const coord = this.pickUncalledCoord(cur);
        if (!coord) {
          this.stopRoundTimer(cur);
          this.logActivity(cur, {
            type: 'system',
            message: `All coordinates called!`,
            tone: 'epic',
          });
          hooks.onTick(cur);
          return;
        }
        const r = this.callCoordinate(cur, coord);
        if (r.error) {
          this.logActivity(cur, {
            type: 'system',
            message: `Timer auto-call failed: ${r.error}`,
            tone: 'bad',
          });
          this.stopRoundTimer(cur);
          hooks.onTick(cur);
          return;
        }
        this.logActivity(cur, {
          type: 'coordinate-called',
          message: `Timer auto-called ${coord}`,
          tone: 'epic',
          meta: { coord, auto: true },
        });
        if (cur.roundTimer) cur.roundTimer.remaining = cur.roundTimer.duration;
        hooks.onAutoCall(cur, coord);
        return;
      }
      hooks.onTick(cur);
    };

    session.roundTimer.intervalId = setInterval(tick, 1000);
    return {};
  }

  /** Stop the timer — clears interval, sets active false, resets remaining. */
  stopRoundTimer(session: GameSession): { error?: string } {
    if (!session.roundTimer || session.roundTimer.duration <= 0) {
      return { error: 'No round timer configured' };
    }
    this.clearTimerInterval(session);
    session.roundTimer.active = false;
    session.roundTimer.remaining = session.roundTimer.duration;
    return {};
  }

  // --- host controls -------------------------------------------------------

  startGame(session: GameSession, hooks?: TimerHooks) {
    if (session.status !== 'lobby') return { error: 'Game already started' };
    if (session.players.size < 1) return { error: 'Need at least 1 player' };
    session.status = 'playing';
    session.startedAt = Date.now();
    // Finalize boards: fill any empty squares randomly + lock all boards.
    for (const player of session.players.values()) {
      if (!player.isBot) {
        const hasEmpty = player.board.some((s) => s.content.kind === 'empty');
        if (hasEmpty) {
          player.board = fillEmptySquares(player.board);
          this.logActivity(session, {
            type: 'system',
            message: `${player.name}'s board auto-completed (random fill)`,
            actor: player.name,
            tone: 'info',
          });
        }
      }
      player.boardLocked = true;
      player.ready = false; // ready is lobby-only
      player.readyAt = undefined;
    }
    this.logActivity(session, {
      type: 'host-action',
      message: `Game started — boards locked in!`,
      tone: 'epic',
    });
    this.persistGameStatus(session);
    // Auto-start the round timer if the host configured one before starting.
    if (session.roundTimer && session.roundTimer.duration > 0 && hooks) {
      this.startRoundTimer(session, hooks);
    }
    return { ok: true };
  }

  // --- board customization (lobby phase) ------------------------------------

  setBoardLayout(
    session: GameSession,
    playerId: string,
    layout: SquareContent[],
  ): { error?: string } {
    if (session.status !== 'lobby') return { error: 'Game has already started' };
    const player = session.players.get(playerId);
    if (!player) return { error: 'Not in game' };
    if (player.isBot) return { error: 'Bots cannot customize boards' };
    if (player.boardLocked) return { error: 'Board is locked' };
    if (!Array.isArray(layout) || layout.length !== BOARD_SIZE * BOARD_SIZE) {
      return { error: 'Layout must have exactly 100 squares' };
    }
    // Validate the distribution matches the palette exactly.
    const cashCounts = new Map<number, number>();
    const powerCounts = new Map<PowerType, number>();
    let emptyCount = 0;
    for (const c of layout) {
      if (c.kind === 'cash') {
        cashCounts.set(c.value, (cashCounts.get(c.value) ?? 0) + 1);
      } else if (c.kind === 'power') {
        powerCounts.set(c.power, (powerCounts.get(c.power) ?? 0) + 1);
      } else if (c.kind === 'empty') {
        emptyCount++;
      } else {
        return { error: 'Invalid square content' };
      }
    }
    for (const entry of BOARD_PALETTE) {
      if (entry.kind === 'cash') {
        const got = cashCounts.get(entry.value!) ?? 0;
        if (got > entry.count) return { error: `Too many $${entry.value} squares` };
      } else {
        const got = powerCounts.get(entry.power!) ?? 0;
        if (got > entry.count) return { error: `Too many ${entry.label} squares` };
      }
    }
    // Apply the layout — preserve coord order + revealed state.
    player.board = player.board.map((sq, i) => ({
      ...sq,
      content: layout[i],
    }));
    // Clear ready state when the board changes — player must re-confirm.
    if (player.ready) {
      player.ready = false;
      player.readyAt = undefined;
    }
    return {};
  }

  setPlayerReady(
    session: GameSession,
    playerId: string,
    ready: boolean,
  ): { error?: string } {
    if (session.status !== 'lobby') return { error: 'Game has already started' };
    const player = session.players.get(playerId);
    if (!player) return { error: 'Not in game' };
    if (player.isBot) return { error: 'Bots cannot toggle ready' };
    if (player.boardLocked) return { error: 'Board is locked' };
    player.ready = ready;
    player.readyAt = ready ? Date.now() : undefined;
    this.logActivity(session, {
      type: 'system',
      message: `${player.name} ${ready ? 'is ready' : 'is no longer ready'}`,
      actor: player.name,
      tone: ready ? 'good' : 'info',
    });
    return {};
  }

  pauseGame(session: GameSession) {
    if (session.status !== 'playing') return { error: 'Not playing' };
    session.status = 'paused';
    // Pause the timer so the countdown doesn't fire while the game is paused.
    this.pauseRoundTimer(session);
    this.logActivity(session, { type: 'host-action', message: `Game paused`, tone: 'info' });
    this.persistGameStatus(session);
    return { ok: true };
  }

  resumeGame(session: GameSession, hooks?: TimerHooks) {
    if (session.status !== 'paused') return { error: 'Not paused' };
    session.status = 'playing';
    this.logActivity(session, { type: 'host-action', message: `Game resumed`, tone: 'info' });
    this.persistGameStatus(session);
    // Resume the timer if it was configured and is currently paused-but-not-stopped.
    if (session.roundTimer && session.roundTimer.duration > 0 && hooks) {
      this.resumeRoundTimer(session, hooks);
    }
    return { ok: true };
  }

  callCoordinate(session: GameSession, coord: string) {
    if (session.status !== 'playing') return { error: 'Game is not active' };
    if (!isValidCoord(coord)) return { error: 'Invalid coordinate' };
    session.currentCoord = coord.toUpperCase();
    session.calledCoordinates.push(coord.toUpperCase());
    // Manual host call resets the round timer's remaining back to its full
    // duration so the next auto-call doesn't skip a beat (per spec).
    if (session.roundTimer && session.roundTimer.duration > 0 && session.roundTimer.active) {
      session.roundTimer.remaining = session.roundTimer.duration;
    }
    this.logActivity(session, {
      type: 'coordinate-called',
      message: `Host called ${coord.toUpperCase()}`,
      tone: 'epic',
      meta: { coord: coord.toUpperCase() },
    });
    return { ok: true };
  }

  setLocked(session: GameSession, locked: boolean) {
    session.locked = locked;
    this.logActivity(session, {
      type: 'host-action',
      message: locked ? `Players locked` : `Players unlocked`,
      tone: 'info',
    });
    return { ok: true };
  }

  // --- reveal ---------------------------------------------------------------

  revealSquare(
    session: GameSession,
    playerId: string,
    coord: string,
  ): { error?: string; player?: Player; toast?: ToastPayload } {
    if (session.status !== 'playing') return { error: 'Game is not active' };
    if (session.locked) return { error: 'Game is locked' };
    const player = session.players.get(playerId);
    if (!player) return { error: 'Not in game' };
    if (!player.connected) return { error: 'Disconnected' };
    const c = coord.toUpperCase();
    if (session.currentCoord && session.currentCoord !== c) {
      // allow revealing previously called coords too (catch-up)
    }
    const square = player.board.find((s) => s.coord === c);
    if (!square) return { error: 'Invalid square' };
    if (square.revealed) return { error: 'Already revealed' };

    square.revealed = true;
    square.revealedAt = Date.now();
    player.lastMove = c;
    player.lastMoveAt = Date.now();

    const content = square.content;
    if (content.kind === 'empty') {
      return { error: 'Square is empty' };
    }
    if (content.kind === 'cash') {
      this.applyCash(session, player, square, content.value);
      return { player, toast: cashToast(content.value) };
    }

    // power
    player.stats.powerSquaresFound += 1;
    const meta = POWERS[content.power];

    // defensive -> inventory
    if (meta.defensive) {
      this.snapshotForUndo(session, [player], `Reveal ${c} → ${meta.label}`);
      player.inventory.push({ type: content.power, acquiredAt: Date.now() });
      pushHistory(player, {
        coord: c,
        text: `Found ${meta.label} — stored in inventory`,
        kind: 'power',
      });
      this.logActivity(session, {
        type: 'power-used',
        message: `${player.name} found ${meta.label}`,
        actor: player.name,
        tone: 'info',
        meta: { power: content.power },
      });
      return {
        player,
        toast: {
          id: uid('t'),
          title: `${meta.label} acquired!`,
          description: meta.description,
          tone: 'good',
          animation: content.power === 'shield' ? 'shield' : 'mirror',
        },
      };
    }

    // self-affecting non-targeting
    if (!meta.targeting) {
      this.snapshotForUndo(session, [player], `Reveal ${c} → ${meta.label}`);
      this.applySelfPower(session, player, content.power, c);
      return { player, toast: selfPowerToast(content.power) };
    }

    // targeting — needs target selection. Mark square revealed, defer effect.
    pushHistory(player, {
      coord: c,
      text: `Found ${meta.label} — choose a target`,
      kind: 'power',
    });
    this.logActivity(session, {
      type: 'power-used',
      message: `${player.name} found ${meta.label} — selecting target…`,
      actor: player.name,
      tone: 'info',
      meta: { power: content.power },
    });
    return {
      player,
      toast: {
        id: uid('t'),
        title: `${meta.label}!`,
        description: 'Choose a target from the modal.',
        tone: 'info',
        animation: 'none',
      },
    };
  }

  private applyCash(
    session: GameSession,
    player: Player,
    square: Square,
    value: number,
  ) {
    this.snapshotForUndo(session, [player], `Reveal ${square.coord} → $${value}`);
    player.runningTotal += value;
    player.stats.moneyFound += value;
    player.stats.cashSquaresFound += 1;
    if (value > player.stats.biggestSingleFind) player.stats.biggestSingleFind = value;
    pushHistory(player, {
      coord: square.coord,
      text: `Found $${value} at ${square.coord}`,
      kind: 'cash',
      delta: value,
    });
    this.logActivity(session, {
      type: 'square-revealed',
      message: `${player.name} found $${value} at ${square.coord}`,
      actor: player.name,
      tone: value >= 100 ? 'epic' : 'good',
      meta: { coord: square.coord, value },
    });
  }

  private applySelfPower(
    session: GameSession,
    player: Player,
    power: PowerType,
    coord: string,
  ) {
    switch (power) {
      case 'shipSinks': {
        const lost = player.runningTotal;
        player.runningTotal = 0;
        player.stats.moneyLost += lost;
        pushHistory(player, { coord, text: `Ship sank! Lost $${lost}`, kind: 'attack', delta: -lost });
        this.logActivity(session, {
          type: 'power-used',
          message: `${player.name}'s ship sank — lost $${lost}`,
          actor: player.name,
          tone: 'bad',
          meta: { power },
        });
        break;
      }
      case 'bank': {
        const banked = player.runningTotal;
        player.bankedTotal += banked;
        player.runningTotal = 0;
        pushHistory(player, { coord, text: `Banked $${banked}`, kind: 'power', delta: banked });
        this.logActivity(session, {
          type: 'power-used',
          message: `${player.name} banked $${banked}`,
          actor: player.name,
          tone: 'good',
          meta: { power },
        });
        break;
      }
      case 'x2': {
        const gain = player.runningTotal;
        player.runningTotal *= 2;
        if (gain > player.stats.biggestMultiplierGain) player.stats.biggestMultiplierGain = gain;
        pushHistory(player, { coord, text: `x2! +$${gain}`, kind: 'power', delta: gain });
        this.logActivity(session, {
          type: 'power-used',
          message: `${player.name} doubled to $${player.runningTotal}`,
          actor: player.name,
          tone: 'epic',
          meta: { power },
        });
        break;
      }
      case 'x3': {
        const gain = player.runningTotal * 2;
        player.runningTotal *= 3;
        if (gain > player.stats.biggestMultiplierGain) player.stats.biggestMultiplierGain = gain;
        pushHistory(player, { coord, text: `x3! +$${gain}`, kind: 'power', delta: gain });
        this.logActivity(session, {
          type: 'power-used',
          message: `${player.name} tripled to $${player.runningTotal}`,
          actor: player.name,
          tone: 'epic',
          meta: { power },
        });
        break;
      }
    }
  }

  // --- targeting -----------------------------------------------------------

  selectTarget(
    session: GameSession,
    attackerId: string,
    powerType: PowerType,
    targetId: string,
  ): { error?: string; pendingDefense?: DefensePrompt; resolved?: boolean } {
    if (session.status !== 'playing') return { error: 'Game is not active' };
    const attacker = session.players.get(attackerId);
    const target = session.players.get(targetId);
    if (!attacker || !target) return { error: 'Invalid players' };
    if (attackerId === targetId) return { error: 'Cannot target yourself' };

    const meta = POWERS[powerType];
    if (!meta || !meta.targeting) return { error: 'Not a targeting power' };

    // Gift is positive — no defense
    if (powerType === 'gift') {
      this.snapshotForUndo(session, [target], `${attacker.name} Gift → ${target.name}`);
      target.runningTotal += 500;
      attacker.stats.moneyGiven += 500;
      pushHistory(target, { text: `Received $500 gift from ${attacker.name}`, kind: 'power', delta: 500 });
      pushHistory(attacker, { text: `Gave $500 gift to ${target.name}`, kind: 'power', delta: -500 });
      this.logActivity(session, {
        type: 'power-used',
        message: `${attacker.name} gifted $500 to ${target.name}`,
        actor: attacker.name,
        tone: 'good',
        meta: { power: powerType },
      });
      return { resolved: true };
    }

    // Negative targeting — check target defenses
    const hasShield = target.inventory.some((i) => i.type === 'shield');
    const hasMirror = target.inventory.some((i) => i.type === 'mirror');

    if (!hasShield && !hasMirror) {
      // resolve immediately
      this.snapshotForUndo(session, [attacker, target], `${attacker.name} ${meta.label} → ${target.name}`);
      this.resolveAttack(session, attacker, target, powerType, 'take');
      return { resolved: true };
    }

    // create defense prompt
    const amount = powerType === 'anchor' ? target.runningTotal : undefined;
    const promptId = uid('def');
    const prompt: DefensePrompt = {
      promptId,
      attackerName: attacker.name,
      attackType: powerType,
      amount,
      hasShield,
      hasMirror,
      deadline: Date.now() + 15000,
    };
    session.pendingDefenses.set(promptId, {
      prompt,
      attackerId,
      targetId,
      powerType,
      amount,
    });
    this.logActivity(session, {
      type: 'system',
      message: `${attacker.name} used ${meta.label} on ${target.name} — awaiting defense…`,
      tone: 'info',
      meta: { power: powerType },
    });
    return { pendingDefense: prompt };
  }

  resolveDefense(
    session: GameSession,
    targetId: string,
    promptId: string,
    choice: DefenseChoice,
  ): { error?: string; resolved?: boolean } {
    const pending = session.pendingDefenses.get(promptId);
    if (!pending) return { error: 'Defense prompt expired or invalid' };
    if (pending.targetId !== targetId) return { error: 'Not your defense prompt' };

    const attacker = session.players.get(pending.attackerId);
    const target = session.players.get(pending.targetId);
    if (!attacker || !target) {
      session.pendingDefenses.delete(promptId);
      return { error: 'Player missing' };
    }

    this.snapshotForUndo(
      session,
      [attacker, target],
      `${attacker.name} ${POWERS[pending.powerType].label} ↔ ${target.name} (${choice})`,
    );

    // consume defense item
    if (choice === 'shield') {
      const idx = target.inventory.findIndex((i) => i.type === 'shield');
      if (idx >= 0) target.inventory.splice(idx, 1);
      target.stats.timesShielded += 1;
    } else if (choice === 'mirror') {
      const idx = target.inventory.findIndex((i) => i.type === 'mirror');
      if (idx >= 0) target.inventory.splice(idx, 1);
      target.stats.timesMirrored += 1;
    }

    this.resolveAttack(session, attacker, target, pending.powerType, choice);
    session.pendingDefenses.delete(promptId);
    return { resolved: true };
  }

  private resolveAttack(
    session: GameSession,
    attacker: Player,
    target: Player,
    power: PowerType,
    choice: DefenseChoice,
  ) {
    target.stats.timesAttacked += 1;
    const meta = POWERS[power];

    if (power === 'anchor') {
      const stolen = target.runningTotal;
      if (choice === 'mirror') {
        // reflected: target steals from attacker instead
        const att = attacker.runningTotal;
        attacker.runningTotal = 0;
        target.runningTotal += att;
        attacker.stats.moneyLost += att;
        pushHistory(attacker, { text: `${target.name}'s Mirror reflected Anchor — you lost $${att}`, kind: 'attack', delta: -att });
        pushHistory(target, { text: `Mirror reflected Anchor — stole $${att} from ${attacker.name}`, kind: 'defense', delta: att });
        this.logActivity(session, {
          type: 'defense-used',
          message: `${target.name}'s Mirror reflected Anchor — stole $${att} from ${attacker.name}`,
          tone: 'epic',
          meta: { power, choice },
        });
      } else if (choice === 'shield') {
        pushHistory(target, { text: `Shield blocked Anchor from ${attacker.name}`, kind: 'defense' });
        pushHistory(attacker, { text: `${target.name}'s Shield blocked your Anchor`, kind: 'attack' });
        this.logActivity(session, {
          type: 'defense-used',
          message: `${target.name} blocked Anchor with Shield`,
          tone: 'good',
          meta: { power, choice },
        });
      } else {
        target.runningTotal = 0;
        attacker.runningTotal += stolen;
        attacker.stats.moneyStolen += stolen;
        target.stats.moneyLost += stolen;
        pushHistory(target, { text: `${attacker.name} stole $${stolen} (Anchor)`, kind: 'attack', delta: -stolen });
        pushHistory(attacker, { text: `Stole $${stolen} from ${target.name} (Anchor)`, kind: 'power', delta: stolen });
        this.logActivity(session, {
          type: 'power-used',
          message: `${attacker.name} stole $${stolen} from ${target.name}`,
          actor: attacker.name,
          tone: 'bad',
          meta: { power, choice },
        });
      }
      return;
    }

    if (power === 'fire') {
      if (choice === 'mirror') {
        const att = attacker.runningTotal;
        attacker.runningTotal = 0;
        attacker.stats.moneyLost += att;
        pushHistory(attacker, { text: `${target.name}'s Mirror reflected Fire — lost $${att}`, kind: 'attack', delta: -att });
        pushHistory(target, { text: `Mirror reflected Fire back at ${attacker.name}`, kind: 'defense' });
        this.logActivity(session, {
          type: 'defense-used',
          message: `${target.name}'s Mirror reflected Fire — ${attacker.name} lost $${att}`,
          tone: 'epic',
          meta: { power, choice },
        });
      } else if (choice === 'shield') {
        pushHistory(target, { text: `Shield blocked Fire from ${attacker.name}`, kind: 'defense' });
        this.logActivity(session, {
          type: 'defense-used',
          message: `${target.name} blocked Fire with Shield`,
          tone: 'good',
          meta: { power, choice },
        });
      } else {
        const lost = target.runningTotal;
        target.runningTotal = 0;
        target.stats.moneyLost += lost;
        pushHistory(target, { text: `${attacker.name} burned $${lost} (Fire)`, kind: 'attack', delta: -lost });
        pushHistory(attacker, { text: `Burned $${lost} from ${target.name} (Fire)`, kind: 'power' });
        this.logActivity(session, {
          type: 'power-used',
          message: `${attacker.name} burned $${lost} of ${target.name}'s money`,
          actor: attacker.name,
          tone: 'bad',
          meta: { power, choice },
        });
      }
      return;
    }

    if (power === 'swap') {
      if (choice === 'mirror' || choice === 'shield') {
        // swap cancelled — defender protected
        pushHistory(target, { text: `${choice === 'mirror' ? 'Mirror' : 'Shield'} blocked Swap from ${attacker.name}`, kind: 'defense' });
        pushHistory(attacker, { text: `${target.name}'s ${choice === 'mirror' ? 'Mirror' : 'Shield'} blocked your Swap`, kind: 'attack' });
        this.logActivity(session, {
          type: 'defense-used',
          message: `${target.name} blocked Swap with ${choice === 'mirror' ? 'Mirror' : 'Shield'}`,
          tone: 'good',
          meta: { power, choice },
        });
      } else {
        const a = attacker.runningTotal;
        const t = target.runningTotal;
        attacker.runningTotal = t;
        target.runningTotal = a;
        pushHistory(attacker, { text: `Swapped running ($${a} ↔ $${t}) with ${target.name}`, kind: 'power' });
        pushHistory(target, { text: `${attacker.name} swapped running totals with you`, kind: 'attack' });
        this.logActivity(session, {
          type: 'power-used',
          message: `${attacker.name} swapped totals with ${target.name}`,
          actor: attacker.name,
          tone: 'bad',
          meta: { power, choice },
        });
      }
      return;
    }
  }

  private sweepDefenses() {
    const now = Date.now();
    for (const session of this.games.values()) {
      for (const [promptId, pending] of session.pendingDefenses) {
        if (now >= pending.prompt.deadline) {
          // auto take
          const attacker = session.players.get(pending.attackerId);
          const target = session.players.get(pending.targetId);
          if (attacker && target) {
            this.snapshotForUndo(
              session,
              [attacker, target],
              `${attacker.name} ${POWERS[pending.powerType].label} → ${target.name} (auto-take)`,
            );
            this.resolveAttack(session, attacker, target, pending.powerType, 'take');
          }
          session.pendingDefenses.delete(promptId);
        }
      }
    }
  }

  // --- undo ----------------------------------------------------------------

  private snapshotForUndo(session: GameSession, players: Player[], description: string) {
    const entry: UndoEntry = {
      id: uid('undo'),
      at: Date.now(),
      description,
      snapshots: snapshotPlayers(players),
    };
    session.undoStack.push(entry);
    if (session.undoStack.length > 50) session.undoStack.shift();
  }

  undo(session: GameSession): { error?: string; description?: string } {
    const entry = session.undoStack.pop();
    if (!entry) return { error: 'Nothing to undo' };
    for (const [pid, snap] of Object.entries(entry.snapshots)) {
      const p = session.players.get(pid);
      if (p) {
        p.runningTotal = snap.runningTotal;
        p.bankedTotal = snap.bankedTotal;
        p.inventory = snap.inventory.map((i) => ({ ...i }));
        p.stats = { ...snap.stats };
      }
    }
    this.logActivity(session, {
      type: 'host-action',
      message: `Host undid: ${entry.description}`,
      tone: 'info',
    });
    return { description: entry.description };
  }

  // --- host overrides ------------------------------------------------------

  forceAward(session: GameSession, playerId: string, amount: number) {
    const p = session.players.get(playerId);
    if (!p) return { error: 'Player not found' };
    this.snapshotForUndo(session, [p], `Force award $${amount} → ${p.name}`);
    p.runningTotal += amount;
    p.stats.moneyFound += amount;
    this.logActivity(session, {
      type: 'host-action',
      message: `Host awarded $${amount} to ${p.name}`,
      tone: 'good',
    });
    return { ok: true };
  }

  forceRemove(session: GameSession, playerId: string, amount: number) {
    const p = session.players.get(playerId);
    if (!p) return { error: 'Player not found' };
    this.snapshotForUndo(session, [p], `Force remove $${amount} ← ${p.name}`);
    p.runningTotal = Math.max(0, p.runningTotal - amount);
    this.logActivity(session, {
      type: 'host-action',
      message: `Host removed $${amount} from ${p.name}`,
      tone: 'bad',
    });
    return { ok: true };
  }

  editTotal(session: GameSession, playerId: string, field: 'running' | 'banked', value: number) {
    const p = session.players.get(playerId);
    if (!p) return { error: 'Player not found' };
    this.snapshotForUndo(session, [p], `Edit ${field} → ${value} for ${p.name}`);
    if (field === 'running') p.runningTotal = Math.max(0, value);
    else p.bankedTotal = Math.max(0, value);
    this.logActivity(session, {
      type: 'host-action',
      message: `Host set ${p.name}'s ${field} to $${value}`,
      tone: 'info',
    });
    return { ok: true };
  }

  editInventory(
    session: GameSession,
    playerId: string,
    action: 'add' | 'remove',
    item: PowerType,
  ) {
    const p = session.players.get(playerId);
    if (!p) return { error: 'Player not found' };
    this.snapshotForUndo(session, [p], `${action} ${item} for ${p.name}`);
    if (action === 'add') p.inventory.push({ type: item, acquiredAt: Date.now() });
    else {
      const idx = p.inventory.findIndex((i) => i.type === item);
      if (idx >= 0) p.inventory.splice(idx, 1);
    }
    this.logActivity(session, {
      type: 'host-action',
      message: `Host ${action === 'add' ? 'gave' : 'removed'} ${POWERS[item].label} ${action === 'add' ? 'to' : 'from'} ${p.name}`,
      tone: 'info',
    });
    return { ok: true };
  }

  revealSquareHost(session: GameSession, playerId: string, coord: string) {
    const p = session.players.get(playerId);
    if (!p) return { error: 'Player not found' };
    const sq = p.board.find((s) => s.coord === coord.toUpperCase());
    if (!sq) return { error: 'Invalid square' };
    if (sq.revealed) {
      sq.revealed = false;
      sq.revealedAt = undefined;
      this.logActivity(session, {
        type: 'host-action',
        message: `Host hid ${coord.toUpperCase()} on ${p.name}'s board`,
        tone: 'info',
      });
      return { ok: true };
    }
    sq.revealed = true;
    sq.revealedAt = Date.now();
    this.logActivity(session, {
      type: 'host-action',
      message: `Host revealed ${coord.toUpperCase()} on ${p.name}'s board`,
      tone: 'info',
    });
    return { ok: true };
  }

  revealAll(session: GameSession) {
    for (const p of session.players.values()) {
      for (const sq of p.board) {
        sq.revealed = true;
        if (!sq.revealedAt) sq.revealedAt = Date.now();
      }
    }
    this.logActivity(session, {
      type: 'host-action',
      message: `Host revealed all boards`,
      tone: 'epic',
    });
    return { ok: true };
  }

  // --- end game ------------------------------------------------------------

  endGame(session: GameSession): GameResults {
    session.status = 'ended';
    session.endedAt = Date.now();
    // Stop the timer so no orphaned intervals survive the game ending.
    this.stopRoundTimer(session);
    const ranking = Array.from(session.players.values())
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        finalScore: p.bankedTotal + p.runningTotal,
        banked: p.bankedTotal,
        running: p.runningTotal,
        isHost: p.isHost,
        player: p,
      }))
      .sort((a, b) => b.finalScore - a.finalScore)
      .map((r, i) => ({
        rank: i + 1,
        playerId: r.playerId,
        name: r.name,
        finalScore: r.finalScore,
        banked: r.banked,
        running: r.running,
        isHost: r.isHost,
      }));

    const awards = this.computeAwards(session);
    this.logActivity(session, {
      type: 'host-action',
      message: `Game ended — ${ranking[0]?.name ?? 'Nobody'} wins!`,
      tone: 'epic',
    });
    this.persistResults(session, ranking, awards);
    return {
      code: session.code,
      endedAt: session.endedAt,
      ranking,
      awards,
    };
  }

  /**
   * Reset the game back to lobby so the SAME players can play again. Each
   * player keeps their name/id/isBot/connected flag but gets a fresh
   * randomized board and zeroed scores/stats/inventory/history. Spectators
   * stay connected. The round timer is reset to its full duration but left
   * inactive. The endedAt timestamp is cleared so the game is ready for a
   * new round. Status change is persisted to the DB.
   */
  resetGame(session: GameSession): { error?: string } {
    // Only allow reset from a terminal-ish state (ended). Hosts can also
    // bail mid-game, but the UI only exposes this on the end-game screen.
    if (session.status !== 'ended') {
      return { error: 'Game is not ended yet' };
    }

    // Stop any orphaned timer interval just in case.
    this.clearTimerInterval(session);

    session.status = 'lobby';
    session.endedAt = undefined;
    session.startedAt = undefined;
    session.currentCoord = undefined;
    session.calledCoordinates = [];
    session.undoStack = [];
    session.pendingDefenses.clear();
    session.locked = false;

    // Wipe activity, then leave a single fresh "Game reset" entry so the
    // feed reads cleanly for the new round.
    session.activity = [];
    this.logActivity(session, {
      type: 'system',
      message: `Game reset — new boards dealt!`,
      tone: 'epic',
    });

    // Regenerate each player's board and zero out their state. Keep name,
    // id, isBot, connected, joinedAt so reconnect-by-name still works and
    // bots survive across rounds. Bots get a fresh random board; humans get
    // an empty board so they can re-customize.
    for (const player of session.players.values()) {
      player.board = player.isBot ? generateBoard() : generateEmptyBoard();
      player.boardLocked = false;
      player.ready = false;
      player.readyAt = undefined;
      player.runningTotal = 0;
      player.bankedTotal = 0;
      player.inventory = [];
      player.history = [];
      player.stats = emptyStats();
      player.lastMove = undefined;
      player.lastMoveAt = undefined;
    }

    // Reset the round timer if one is configured — back to full duration,
    // inactive. The host will Start it again from the dashboard.
    if (session.roundTimer && session.roundTimer.duration > 0) {
      session.roundTimer.active = false;
      session.roundTimer.remaining = session.roundTimer.duration;
      session.roundTimer.intervalId = null;
    }

    // Persist the status change so the DB reflects the new lobby state.
    void this.persistGameStatus(session);
    return {};
  }

  private computeAwards(session: GameSession): AwardResult[] {
    const players = Array.from(session.players.values());
    if (players.length === 0) return [];
    const awards: AwardResult[] = [];

    const maxBy = (fn: (p: Player) => number): Player | undefined => {
      let best: Player | undefined;
      let bestV = -Infinity;
      for (const p of players) {
        const v = fn(p);
        if (v > bestV) {
          bestV = v;
          best = p;
        }
      }
      return bestV > 0 ? best : undefined;
    };

    const moneyFound = maxBy((p) => p.stats.moneyFound);
    if (moneyFound)
      awards.push({
        category: 'mostMoneyFound',
        label: 'Most Money Found',
        playerId: moneyFound.id,
        playerName: moneyFound.name,
        value: moneyFound.stats.moneyFound,
        icon: 'Coins',
      });

    const stolen = maxBy((p) => p.stats.moneyStolen);
    if (stolen)
      awards.push({
        category: 'mostMoneyStolen',
        label: 'Most Money Stolen',
        playerId: stolen.id,
        playerName: stolen.name,
        value: stolen.stats.moneyStolen,
        icon: 'Anchor',
      });

    const generous = maxBy((p) => p.stats.moneyGiven);
    if (generous)
      awards.push({
        category: 'mostGenerous',
        label: 'Most Generous',
        playerId: generous.id,
        playerName: generous.name,
        value: generous.stats.moneyGiven,
        icon: 'Gift',
      });

    const unlucky = maxBy((p) => p.stats.moneyLost);
    if (unlucky)
      awards.push({
        category: 'mostUnlucky',
        label: 'Most Unlucky',
        playerId: unlucky.id,
        playerName: unlucky.name,
        value: unlucky.stats.moneyLost,
        icon: 'CloudRain',
      });

    const mult = maxBy((p) => p.stats.biggestMultiplierGain);
    if (mult)
      awards.push({
        category: 'biggestMultiplier',
        label: 'Biggest Multiplier',
        playerId: mult.id,
        playerName: mult.name,
        value: mult.stats.biggestMultiplierGain,
        icon: 'Layers',
      });

    const bank = maxBy((p) => p.bankedTotal);
    if (bank)
      awards.push({
        category: 'biggestBank',
        label: 'Biggest Bank',
        playerId: bank.id,
        playerName: bank.name,
        value: bank.bankedTotal,
        icon: 'Landmark',
      });

    const find = maxBy((p) => p.stats.biggestSingleFind);
    if (find)
      awards.push({
        category: 'biggestSingleFind',
        label: 'Biggest Single Find',
        playerId: find.id,
        playerName: find.name,
        value: find.stats.biggestSingleFind,
        icon: 'Gem',
      });

    const attacked = maxBy((p) => p.stats.timesAttacked);
    if (attacked)
      awards.push({
        category: 'mostAttacked',
        label: 'Most Attacked',
        playerId: attacked.id,
        playerName: attacked.name,
        value: attacked.stats.timesAttacked,
        icon: 'Target',
      });

    const shields = maxBy((p) => p.stats.timesShielded);
    if (shields)
      awards.push({
        category: 'mostShieldsUsed',
        label: 'Most Shields Used',
        playerId: shields.id,
        playerName: shields.name,
        value: shields.stats.timesShielded,
        icon: 'Shield',
      });

    const mirrors = maxBy((p) => p.stats.timesMirrored);
    if (mirrors)
      awards.push({
        category: 'mostMirrorsUsed',
        label: 'Most Mirrors Used',
        playerId: mirrors.id,
        playerName: mirrors.name,
        value: mirrors.stats.timesMirrored,
        icon: 'FlipHorizontal',
      });

    return awards;
  }

  // --- persistence ---------------------------------------------------------

  private async persistGameStatus(session: GameSession) {
    try {
      if (!this.db || !session.dbGameId) return;
      await this.db.game.update({
        where: { id: session.dbGameId },
        data: {
          status: session.status,
          startedAt: session.startedAt ? new Date(session.startedAt) : undefined,
          endedAt: session.endedAt ? new Date(session.endedAt) : undefined,
        },
      });
    } catch (e) {
      console.error('[pirate] persist status failed', e);
    }
  }

  private async persistResults(
    session: GameSession,
    ranking: GameResults['ranking'],
    awards: AwardResult[],
  ) {
    try {
      if (!this.db || !session.dbGameId) return;
      await this.db.game.update({
        where: { id: session.dbGameId },
        data: { status: 'ended', endedAt: new Date() },
      });
      for (const r of ranking) {
        const p = session.players.get(r.playerId);
        await this.db.gameResult.create({
          data: {
            gameId: session.dbGameId,
            playerId: r.playerId, // note: uses socket id; acceptable for demo
            rank: r.rank,
            score: r.finalScore,
            award: awards.find((a) => a.playerId === r.playerId)?.label ?? null,
          },
        });
        if (p) {
          await this.db.player.upsert({
            where: { id: r.playerId },
            create: {
              gameId: session.dbGameId,
              name: r.name,
              finalScore: r.finalScore,
              banked: r.banked,
              running: r.running,
              connected: p.connected,
            },
            update: {
              finalScore: r.finalScore,
              banked: r.banked,
              running: r.running,
              connected: p.connected,
            },
          });
        }
      }
    } catch (e) {
      console.error('[pirate] persist results failed', e);
    }
  }

  async persistActivity(session: GameSession, event: ActivityEvent) {
    try {
      if (!this.db || !session.dbGameId) return;
      await this.db.gameEvent.create({
        data: {
          gameId: session.dbGameId,
          type: event.type,
          message: event.message,
          actor: event.actor ?? 'system',
          metaJson: JSON.stringify(event.meta ?? {}),
        },
      });
    } catch (e) {
      // non-fatal
    }
  }

  // --- activity ------------------------------------------------------------

  logActivity(
    session: GameSession,
    e: Omit<ActivityEvent, 'id' | 'at'>,
  ): ActivityEvent {
    const event: ActivityEvent = { id: uid('act'), at: Date.now(), ...e };
    session.activity.push(event);
    if (session.activity.length > 500) session.activity.shift();
    void this.persistActivity(session, event);
    return event;
  }

  // --- snapshots -----------------------------------------------------------

  hostSnapshot(session: GameSession): HostGameState {
    return {
      code: session.code,
      status: session.status,
      hostName: session.hostName,
      currentCoord: session.currentCoord,
      calledCoordinates: session.calledCoordinates,
      locked: session.locked,
      players: Array.from(session.players.values()).map((p) => this.scrubPlayer(p)),
      activity: session.activity.slice(-200),
      undoStack: session.undoStack.slice(-20).map((u) => ({
        id: u.id,
        at: u.at,
        description: u.description,
      })),
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      spectatorCount: session.spectators.size,
      roundTimer: session.roundTimer && session.roundTimer.duration > 0
        ? {
            duration: session.roundTimer.duration,
            remaining: session.roundTimer.remaining,
            active: session.roundTimer.active,
          }
        : undefined,
    };
  }

  playerSnapshot(session: GameSession, playerId: string): PlayerGameState | undefined {
    const me = session.players.get(playerId);
    if (!me) return undefined;
    return {
      code: session.code,
      status: session.status,
      hostName: session.hostName,
      currentCoord: session.currentCoord,
      calledCoordinates: session.calledCoordinates,
      locked: session.locked,
      me: this.scrubPlayer(me),
      rivals: Array.from(session.players.values())
        .filter((p) => p.id !== playerId)
        .map((p) => ({
          id: p.id,
          name: p.name,
          runningTotal: p.runningTotal,
          bankedTotal: p.bankedTotal,
          inventoryCount: p.inventory.length,
          connected: p.connected,
          isHost: p.isHost,
        })),
      activity: session.activity.slice(-100),
      roundTimer: session.roundTimer && session.roundTimer.duration > 0
        ? {
            duration: session.roundTimer.duration,
            remaining: session.roundTimer.remaining,
            active: session.roundTimer.active,
          }
        : undefined,
    };
  }

  private scrubPlayer(p: Player): Player {
    return {
      ...p,
      board: p.board.map((s) => ({ ...s })),
      inventory: p.inventory.map((i) => ({ ...i })),
      history: p.history.map((h) => ({ ...h })),
      stats: { ...p.stats },
    };
  }
}

// ---------------------------------------------------------------------------
// Toast helpers
// ---------------------------------------------------------------------------

function cashToast(value: number): ToastPayload {
  if (value >= 500) {
    return {
      id: uid('t'),
      title: `JACKPOT! $${value}!`,
      description: 'A massive haul!',
      tone: 'epic',
      animation: 'confetti',
    };
  }
  if (value >= 100) {
    return {
      id: uid('t'),
      title: `Big find! $${value}`,
      description: 'Nice treasure!',
      tone: 'epic',
      animation: 'coins',
    };
  }
  return {
    id: uid('t'),
    title: `+$${value}`,
    tone: 'good',
    animation: 'coins',
  };
}

function selfPowerToast(power: PowerType): ToastPayload {
  switch (power) {
    case 'shipSinks':
      return {
        id: uid('t'),
        title: 'Ship Sinks!',
        description: 'Your running total sank to zero.',
        tone: 'bad',
        animation: 'splash',
      };
    case 'bank':
      return {
        id: uid('t'),
        title: 'Banked!',
        description: 'Your money is safe forever.',
        tone: 'good',
        animation: 'coins',
      };
    case 'x2':
      return {
        id: uid('t'),
        title: 'x2 Double!',
        description: 'Running total doubled.',
        tone: 'epic',
        animation: 'confetti',
      };
    case 'x3':
      return {
        id: uid('t'),
        title: 'x3 Triple!',
        description: 'Running total tripled!',
        tone: 'epic',
        animation: 'confetti',
      };
    default:
      return { id: uid('t'), title: 'Power activated', tone: 'info', animation: 'none' };
  }
}
