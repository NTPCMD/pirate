// ============================================================================
// Pirate Game — Shared Types
// Single source of truth shared between the Next.js frontend and the
// socket.io mini-service. The mini-service imports this file via relative path.
// ============================================================================

export const BOARD_SIZE = 10;
export const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;
export type Column = (typeof COLUMNS)[number];

// --- Board contents ---------------------------------------------------------

export type CashValue = 5 | 10 | 20 | 50 | 100 | 500 | 1000;

export type PowerType =
  | 'anchor' // steal another player's running total
  | 'swap' // swap running totals with another player
  | 'fire' // zero another player's running total
  | 'gift' // give another player $500
  | 'shipSinks' // zero own running total
  | 'bank' // move running total into bank
  | 'x2' // double running total
  | 'x3' // triple running total
  | 'shield' // inventory: block one negative attack
  | 'mirror'; // inventory: reflect one negative attack

export interface CashContent {
  kind: 'cash';
  value: CashValue;
}

export interface PowerContent {
  kind: 'power';
  power: PowerType;
}

export interface EmptyContent {
  kind: 'empty';
}

export type SquareContent = CashContent | PowerContent | EmptyContent;

export interface Square {
  coord: string; // e.g. "F7"
  content: SquareContent;
  revealed: boolean;
  revealedAt?: number;
}

export type Board = Square[]; // length 100

// --- Power metadata ---------------------------------------------------------

export interface PowerMeta {
  type: PowerType;
  label: string;
  icon: string; // lucide icon name
  description: string;
  color: string; // tailwind gradient base e.g. "amber"
  targeting: boolean; // requires target selection
  defensive: boolean; // stored in inventory
  negative: boolean; // is a negative attack (blockable by shield/mirror)
}

export const POWERS: Record<PowerType, PowerMeta> = {
  anchor: {
    type: 'anchor',
    label: 'Anchor',
    icon: 'Anchor',
    description: 'Steal another player\'s entire running total.',
    color: 'sky',
    targeting: true,
    defensive: false,
    negative: true,
  },
  swap: {
    type: 'swap',
    label: 'Swap',
    icon: 'ArrowLeftRight',
    description: 'Swap running totals with another player.',
    color: 'violet',
    targeting: true,
    defensive: false,
    negative: true,
  },
  fire: {
    type: 'fire',
    label: 'Fire',
    icon: 'Flame',
    description: 'Burn another player\'s running total to zero.',
    color: 'red',
    targeting: true,
    defensive: false,
    negative: true,
  },
  gift: {
    type: 'gift',
    label: 'Gift',
    icon: 'Gift',
    description: 'Give another player $500 instantly.',
    color: 'emerald',
    targeting: true,
    defensive: false,
    negative: false,
  },
  shipSinks: {
    type: 'shipSinks',
    label: 'Ship Sinks',
    icon: 'Ship',
    description: 'Your running total sinks to zero.',
    color: 'cyan',
    targeting: false,
    defensive: false,
    negative: true,
  },
  bank: {
    type: 'bank',
    label: 'Bank',
    icon: 'Landmark',
    description: 'Bank your entire running total — safe forever.',
    color: 'yellow',
    targeting: false,
    defensive: false,
    negative: false,
  },
  x2: {
    type: 'x2',
    label: 'x2',
    icon: 'ChevronsUp',
    description: 'Double your running total.',
    color: 'orange',
    targeting: false,
    defensive: false,
    negative: false,
  },
  x3: {
    type: 'x3',
    label: 'x3',
    icon: 'TrendingUp',
    description: 'Triple your running total.',
    color: 'rose',
    targeting: false,
    defensive: false,
    negative: false,
  },
  shield: {
    type: 'shield',
    label: 'Shield',
    icon: 'Shield',
    description: 'Block one future negative attack.',
    color: 'slate',
    targeting: false,
    defensive: true,
    negative: false,
  },
  mirror: {
    type: 'mirror',
    label: 'Mirror',
    icon: 'FlipHorizontal',
    description: 'Reflect one future negative attack back to the attacker.',
    color: 'fuchsia',
    targeting: false,
    defensive: true,
    negative: false,
  },
};

// Cash distribution across the 90 cash squares
export const CASH_DISTRIBUTION: CashValue[] = [
  ...Array(45).fill(5),
  ...Array(20).fill(10),
  ...Array(12).fill(20),
  ...Array(7).fill(50),
  ...Array(4).fill(100),
  ...Array(1).fill(500),
  ...Array(1).fill(1000),
] as CashValue[];

// Power distribution — exactly one of each
export const POWER_DISTRIBUTION: PowerType[] = [
  'anchor',
  'swap',
  'fire',
  'gift',
  'shipSinks',
  'bank',
  'x2',
  'x3',
  'shield',
  'mirror',
];

// The full palette of items every board must contain (90 cash + 10 power = 100).
// Used for board customization validation and auto-fill.
export interface PaletteEntry {
  kind: 'cash' | 'power';
  value?: CashValue;
  power?: PowerType;
  count: number;
  label: string;
}

export const BOARD_PALETTE: PaletteEntry[] = [
  { kind: 'cash', value: 5, count: 45, label: '$5' },
  { kind: 'cash', value: 10, count: 20, label: '$10' },
  { kind: 'cash', value: 20, count: 12, label: '$20' },
  { kind: 'cash', value: 50, count: 7, label: '$50' },
  { kind: 'cash', value: 100, count: 4, label: '$100' },
  { kind: 'cash', value: 500, count: 1, label: '$500' },
  { kind: 'cash', value: 1000, count: 1, label: '$1000' },
  ...POWER_DISTRIBUTION.map((p) => ({
    kind: 'power' as const,
    power: p,
    count: 1,
    label: POWERS[p].label,
  })),
];

// --- Player state -----------------------------------------------------------

export interface InventoryItem {
  type: PowerType;
  acquiredAt: number;
}

export interface PlayerStats {
  moneyFound: number; // total cash revealed
  moneyStolen: number; // gained via anchor
  moneyGiven: number; // given via gift
  moneyLost: number; // lost to attacks/sinks
  timesAttacked: number;
  timesShielded: number;
  timesMirrored: number;
  biggestSingleFind: number;
  biggestMultiplierGain: number;
  cashSquaresFound: number;
  powerSquaresFound: number;
}

export interface PlayerHistoryEntry {
  at: number;
  coord?: string;
  text: string;
  kind: 'cash' | 'power' | 'attack' | 'defense' | 'system';
  delta?: number;
}

export interface Player {
  id: string; // socket id
  name: string;
  gameCode: string;
  board: Board;
  runningTotal: number;
  bankedTotal: number;
  inventory: InventoryItem[];
  connected: boolean;
  joinedAt: number;
  lastMove?: string;
  lastMoveAt?: number;
  history: PlayerHistoryEntry[];
  stats: PlayerStats;
  isHost: boolean;
  isBot?: boolean;
  boardLocked?: boolean; // true once the game starts — board can no longer be edited
  ready?: boolean; // player has marked their board setup as complete (lobby phase)
  readyAt?: number;
}

// --- Activity log -----------------------------------------------------------

export interface ActivityEvent {
  id: string;
  at: number;
  type:
    | 'player-joined'
    | 'player-left'
    | 'player-reconnected'
    | 'coordinate-called'
    | 'square-revealed'
    | 'power-used'
    | 'defense-used'
    | 'host-action'
    | 'system';
  message: string;
  actor?: string;
  tone?: 'neutral' | 'good' | 'bad' | 'epic' | 'info';
  meta?: Record<string, unknown>;
}

// --- Game state -------------------------------------------------------------

export type GameStatus = 'lobby' | 'playing' | 'paused' | 'ended';

export interface UndoEntry {
  id: string;
  at: number;
  description: string;
  snapshots: Record<
    string,
    {
      runningTotal: number;
      bankedTotal: number;
      inventory: InventoryItem[];
      stats: PlayerStats;
    }
  >;
}

export interface PublicGame {
  code: string;
  status: GameStatus;
  hostName: string;
  currentCoord?: string;
  calledCoordinates: string[];
  locked: boolean;
  playerCount: number;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
}

// Snapshot sent to the host — includes all players' boards
export interface HostGameState {
  code: string;
  status: GameStatus;
  hostName: string;
  currentCoord?: string;
  calledCoordinates: string[];
  locked: boolean;
  players: Player[];
  activity: ActivityEvent[];
  undoStack: { id: string; at: number; description: string }[];
  createdAt: number;
  startedAt?: number;
  roundTimer?: { duration: number; remaining: number; active: boolean };
  /** Number of spectators currently watching this game. */
  spectatorCount?: number;
}

// Snapshot sent to a single player — own board only + public info about rivals
export interface PlayerGameState {
  code: string;
  status: GameStatus;
  hostName: string;
  currentCoord?: string;
  calledCoordinates: string[];
  locked: boolean;
  me: Player;
  rivals: Array<{
    id: string;
    name: string;
    runningTotal: number;
    bankedTotal: number;
    inventoryCount: number;
    connected: boolean;
    isHost: boolean;
  }>;
  activity: ActivityEvent[];
  roundTimer?: { duration: number; remaining: number; active: boolean };
}

// --- Spectator state -------------------------------------------------------

/**
 * A spectator's view of a player. The board is SCRUBBED on the server: hidden
 * squares have their `content` replaced with a harmless cash $0 placeholder,
 * and only `revealed === true` squares keep their real content. This guarantees
 * spectators can never see what's hidden on other players' boards.
 */
export type SpectatorPlayer = Player;

/**
 * Snapshot sent to a spectator — same shape as HostGameState but with player
 * boards scrubbed (hidden squares redacted). Spectators can see:
 *  - leaderboard (names, scores, inventory counts)
 *  - revealed squares on all boards (never hidden ones)
 *  - full activity feed
 *  - current called coordinate
 *  - spectator list (so they can see how many others are watching)
 * Spectators do NOT get: host controls, their own board, or hidden square
 * contents on any player's board.
 */
export interface SpectatorGameState {
  code: string;
  status: GameStatus;
  hostName: string;
  currentCoord?: string;
  calledCoordinates: string[];
  locked: boolean;
  players: SpectatorPlayer[];
  activity: ActivityEvent[];
  createdAt: number;
  startedAt?: number;
  roundTimer?: { duration: number; remaining: number; active: boolean };
  spectators: Array<{ id: string; name: string; joinedAt: number; connected: boolean }>;
}

// --- Defense resolution (targeted attacks) ---------------------------------

export type DefenseChoice = 'mirror' | 'shield' | 'take';

export interface DefensePrompt {
  promptId: string;
  attackerName: string;
  attackType: PowerType;
  amount?: number; // for anchor: amount that would be stolen
  hasShield: boolean;
  hasMirror: boolean;
  deadline: number; // epoch ms
}

// --- Socket event names -----------------------------------------------------

export const CLIENT_EVENTS = {
  hostCreate: 'host:create',
  hostStart: 'host:start',
  hostPause: 'host:pause',
  hostResume: 'host:resume',
  hostEnd: 'host:end',
  hostCallCoord: 'host:call-coordinate',
  hostRevealAll: 'host:reveal-all',
  hostRevealSquare: 'host:reveal-square',
  hostForceAward: 'host:force-award',
  hostForceRemove: 'host:force-remove',
  hostEditTotal: 'host:edit-total',
  hostEditInventory: 'host:edit-inventory',
  hostLockPlayers: 'host:lock-players',
  hostUndo: 'host:undo',
  hostKick: 'host:kick',
  hostExport: 'host:export',
  hostAddBot: 'host:add-bot',
  hostRemoveBot: 'host:remove-bot',
  hostSetTimerDuration: 'host:set-timer-duration',
  hostStartTimer: 'host:start-timer',
  hostPauseTimer: 'host:pause-timer',
  hostResumeTimer: 'host:resume-timer',
  hostStopTimer: 'host:stop-timer',
  hostResetGame: 'host:reset-game',
  playerSetBoardLayout: 'player:set-board-layout',
  playerSetReady: 'player:set-ready',
  playerJoin: 'player:join',
  playerReveal: 'player:reveal',
  playerSubmitTally: 'player:submit-tally',
  playerSelectTarget: 'player:select-target',
  playerDefenseChoice: 'player:defense-choice',
  playerUseInventory: 'player:use-inventory',
  playerReact: 'player:react',
  playerChat: 'player:chat',
  spectatorJoin: 'spectator:join',
  ping: 'ping',
} as const;

export const SERVER_EVENTS = {
  error: 'error',
  hostCreated: 'host:created',
  state: 'state',
  coordinateCalled: 'coordinate-called',
  squareRevealed: 'square-revealed',
  powerResult: 'power-result',
  defensePrompt: 'defense-prompt',
  activity: 'activity',
  toast: 'toast',
  gameEnded: 'game-ended',
  gameReset: 'game-reset',
  kicked: 'kicked',
  locked: 'locked',
  pong: 'pong',
  reaction: 'reaction',
  chat: 'chat',
} as const;

// --- Emotes / Quick reactions ----------------------------------------------

/**
 * A floating emoji reaction broadcast in real time. Ephemeral — NOT persisted
 * to the activity log or DB. The server broadcasts these via
 * SERVER_EVENTS.reaction, and each client keeps a short-lived local list to
 * render the floating animation.
 */
export interface Reaction {
  id: string;
  emoji: string;
  playerName: string;
  at: number;
}

// --- Chat ------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  playerName: string;
  role: 'host' | 'player' | 'spectator';
  text: string;
  at: number;
}

export interface EmoteMeta {
  emoji: string;
  label: string;
}

/**
 * The fixed palette of pirate-themed quick reactions. The server validates
 * incoming reactions against this list (anything else is rejected).
 */
export const EMOTES: EmoteMeta[] = [
  { emoji: '🎉', label: 'Celebrate' },
  { emoji: '💰', label: 'Money' },
  { emoji: '⚓', label: 'Anchor' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '😱', label: 'Shock' },
  { emoji: '🤝', label: 'Truce' },
];

/** Set of allowed emoji for O(1) server-side validation. */
export const ALLOWED_REACTION_EMOJI: ReadonlySet<string> = new Set(
  EMOTES.map((e) => e.emoji),
);

export interface ToastPayload {
  id: string;
  title: string;
  description?: string;
  tone: 'neutral' | 'good' | 'bad' | 'epic' | 'info';
  animation?: 'confetti' | 'shake' | 'coins' | 'fire' | 'splash' | 'anchor' | 'shield' | 'mirror' | 'none';
}

// --- End-game results -------------------------------------------------------

export interface AwardResult {
  category: string;
  label: string;
  playerId?: string;
  playerName?: string;
  value?: number | string;
  icon: string;
}

export interface GameResults {
  code: string;
  endedAt: number;
  ranking: Array<{
    rank: number;
    playerId: string;
    name: string;
    finalScore: number;
    banked: number;
    running: number;
    isHost: boolean;
  }>;
  awards: AwardResult[];
}

// --- Helpers ----------------------------------------------------------------

export function emptyStats(): PlayerStats {
  return {
    moneyFound: 0,
    moneyStolen: 0,
    moneyGiven: 0,
    moneyLost: 0,
    timesAttacked: 0,
    timesShielded: 0,
    timesMirrored: 0,
    biggestSingleFind: 0,
    biggestMultiplierGain: 0,
    cashSquaresFound: 0,
    powerSquaresFound: 0,
  };
}

export function coordToIndex(coord: string): number {
  const col = COLUMNS.indexOf(coord[0].toUpperCase() as Column);
  const row = parseInt(coord.slice(1), 10) - 1;
  if (col < 0 || row < 0 || row >= BOARD_SIZE) return -1;
  return row * BOARD_SIZE + col;
}

export function indexToCoord(index: number): string {
  const col = COLUMNS[index % BOARD_SIZE];
  const row = Math.floor(index / BOARD_SIZE) + 1;
  return `${col}${row}`;
}

export function isValidCoord(coord: string): boolean {
  return coordToIndex(coord) >= 0;
}

export function formatMoney(n: number): string {
  return '$' + n.toLocaleString('en-US');
}
