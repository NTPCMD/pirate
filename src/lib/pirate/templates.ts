// Board templates — preset layout strategies for quick board setup.
// Each template produces a full 100-square content array following the
// standard palette distribution (90 cash + 10 power).

import {
  BOARD_PALETTE,
  BOARD_SIZE,
  type CashValue,
  type PowerType,
  type SquareContent,
} from '@/lib/pirate/types';

export interface BoardTemplate {
  id: string;
  label: string;
  description: string;
  icon: string; // lucide icon name
  generate: () => SquareContent[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build the full palette multiset as content objects.
function fullPalette(): SquareContent[] {
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
  return all;
}

// Split cash into tiers for strategic placement.
function cashTiers(): { low: { kind: 'cash'; value: CashValue }[]; mid: { kind: 'cash'; value: CashValue }[]; high: { kind: 'cash'; value: CashValue }[]; jackpot: { kind: 'cash'; value: CashValue }[] } {
  const all = fullPalette().filter((c): c is { kind: 'cash'; value: CashValue } => c.kind === 'cash');
  return {
    low: all.filter((c) => c.value <= 10),
    mid: all.filter((c) => c.value === 20 || c.value === 50),
    high: all.filter((c) => c.value === 100),
    jackpot: all.filter((c) => c.value >= 500),
  };
}

function powersList(): { kind: 'power'; power: PowerType }[] {
  return fullPalette().filter((c): c is { kind: 'power'; power: PowerType } => c.kind === 'power');
}

// Index helpers: 0..99 → row/col, distance from center
function centerDistance(idx: number): number {
  const row = Math.floor(idx / BOARD_SIZE);
  const col = idx % BOARD_SIZE;
  const dr = row - 4.5;
  const dc = col - 4.5;
  return Math.sqrt(dr * dr + dc * dc);
}

function isCorner(idx: number): boolean {
  const row = Math.floor(idx / BOARD_SIZE);
  const col = idx % BOARD_SIZE;
  return (row === 0 || row === BOARD_SIZE - 1) && (col === 0 || col === BOARD_SIZE - 1);
}

function isDiagonal(idx: number): boolean {
  const row = Math.floor(idx / BOARD_SIZE);
  const col = idx % BOARD_SIZE;
  return row === col || row + col === BOARD_SIZE - 1;
}

function isEdge(idx: number): boolean {
  const row = Math.floor(idx / BOARD_SIZE);
  const col = idx % BOARD_SIZE;
  return row === 0 || row === BOARD_SIZE - 1 || col === 0 || col === BOARD_SIZE - 1;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/** Cluster: high-value cash + powers in the center, low-value on edges. */
function clusterTemplate(): SquareContent[] {
  const tiers = cashTiers();
  const powers = shuffle(powersList());
  const indices = Array.from({ length: 100 }, (_, i) => i);
  // Sort by distance from center (closest first)
  const byCenter = [...indices].sort((a, b) => centerDistance(a) - centerDistance(b));

  const result: SquareContent[] = new Array(100).fill(null);
  // Place jackpots dead center, then high, then powers, then mid, then low
  const queue: SquareContent[] = [
    ...shuffle(tiers.jackpot),
    ...shuffle(tiers.high),
    ...shuffle(powers),
    ...shuffle(tiers.mid),
    ...shuffle(tiers.low),
  ];
  for (let i = 0; i < 100; i++) {
    result[byCenter[i]] = queue[i];
  }
  return result;
}

/** Spread: high-value items maximally spread apart (anti-cluster). */
function spreadTemplate(): SquareContent[] {
  const tiers = cashTiers();
  const powers = shuffle(powersList());
  const result: SquareContent[] = new Array(100).fill(null);

  // Place high-value + powers first at spread positions using a grid stride
  const highValue = shuffle([...tiers.jackpot, ...tiers.high, ...powers]);
  // Use evenly-spaced indices: stride through the board
  const stride = Math.floor(100 / highValue.length);
  const startOffset = Math.floor(stride / 2);
  highValue.forEach((item, i) => {
    let idx = (startOffset + i * stride) % 100;
    // find next empty slot if collision
    while (result[idx] !== null) idx = (idx + 1) % 100;
    result[idx] = item;
  });

  // Fill remaining with shuffled mid + low
  const rest = shuffle([...tiers.mid, ...tiers.low]);
  let ri = 0;
  for (let i = 0; i < 100; i++) {
    if (result[i] === null) result[i] = rest[ri++];
  }
  return result;
}

/** Corners: high-value + powers concentrated in the four corners. */
function cornersTemplate(): SquareContent[] {
  const tiers = cashTiers();
  const powers = shuffle(powersList());
  const indices = Array.from({ length: 100 }, (_, i) => i);
  // Sort by distance from nearest corner (closest first)
  const byCorner = [...indices].sort((a, b) => {
    const da = Math.min(
      centerDistance(a - 0),
      // distance to each corner approximated via row/col
      Math.hypot(Math.floor(a / BOARD_SIZE), a % BOARD_SIZE),
      Math.hypot(Math.floor(a / BOARD_SIZE), BOARD_SIZE - 1 - (a % BOARD_SIZE)),
      Math.hypot(BOARD_SIZE - 1 - Math.floor(a / BOARD_SIZE), a % BOARD_SIZE),
      Math.hypot(BOARD_SIZE - 1 - Math.floor(a / BOARD_SIZE), BOARD_SIZE - 1 - (a % BOARD_SIZE)),
    );
    const db = Math.min(
      Math.hypot(Math.floor(b / BOARD_SIZE), b % BOARD_SIZE),
      Math.hypot(Math.floor(b / BOARD_SIZE), BOARD_SIZE - 1 - (b % BOARD_SIZE)),
      Math.hypot(BOARD_SIZE - 1 - Math.floor(b / BOARD_SIZE), b % BOARD_SIZE),
      Math.hypot(BOARD_SIZE - 1 - Math.floor(b / BOARD_SIZE), BOARD_SIZE - 1 - (b % BOARD_SIZE)),
    );
    return da - db;
  });

  const result: SquareContent[] = new Array(100).fill(null);
  const queue: SquareContent[] = [
    ...shuffle(tiers.jackpot),
    ...shuffle(tiers.high),
    ...shuffle(powers),
    ...shuffle(tiers.mid),
    ...shuffle(tiers.low),
  ];
  for (let i = 0; i < 100; i++) {
    result[byCorner[i]] = queue[i];
  }
  return result;
}

/** Diagonal: high-value + powers along the two main diagonals. */
function diagonalTemplate(): SquareContent[] {
  const tiers = cashTiers();
  const powers = shuffle(powersList());
  const result: SquareContent[] = new Array(100).fill(null);

  // Place high-value + powers on diagonal positions first
  const diagItems = shuffle([...tiers.jackpot, ...tiers.high, ...powers]);
  const diagIndices = Array.from({ length: 100 }, (_, i) => i).filter(isDiagonal);
  const shuffledDiag = shuffle(diagIndices);
  diagItems.forEach((item, i) => {
    if (i < shuffledDiag.length) result[shuffledDiag[i]] = item;
  });

  // Fill remaining with mid + low
  const rest = shuffle([...tiers.mid, ...tiers.low]);
  let ri = 0;
  for (let i = 0; i < 100; i++) {
    if (result[i] === null) result[i] = rest[ri++];
  }
  return result;
}

/** Edges: high-value on the border, low-value in the interior. */
function edgesTemplate(): SquareContent[] {
  const tiers = cashTiers();
  const powers = shuffle(powersList());
  const indices = Array.from({ length: 100 }, (_, i) => i);
  const edgeIndices = shuffle(indices.filter(isEdge));
  const interiorIndices = shuffle(indices.filter((i) => !isEdge(i)));

  const result: SquareContent[] = new Array(100).fill(null);
  // High-value + powers on edges
  const edgeItems = shuffle([...tiers.jackpot, ...tiers.high, ...powers, ...tiers.mid]);
  edgeItems.forEach((item, i) => {
    if (i < edgeIndices.length) result[edgeIndices[i]] = item;
  });
  // Low-value in interior
  const interiorItems = shuffle(tiers.low);
  interiorIndices.forEach((idx, i) => {
    result[idx] = interiorItems[i] ?? { kind: 'cash', value: 5 };
  });
  return result;
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'cluster',
    label: 'Cluster',
    description: 'High-value treasures clustered in the center.',
    icon: 'Crosshair',
    generate: clusterTemplate,
  },
  {
    id: 'spread',
    label: 'Spread',
    description: 'Valuables maximally spread apart — hard to hit.',
    icon: 'Grid3x3',
    generate: spreadTemplate,
  },
  {
    id: 'corners',
    label: 'Corners',
    description: 'Riches hoarded in the four corners.',
    icon: 'CornerDownRight',
    generate: cornersTemplate,
  },
  {
    id: 'diagonal',
    label: 'Diagonal',
    description: 'Powers and jackpots along the diagonals.',
    icon: 'MoveDiagonal',
    generate: diagonalTemplate,
  },
  {
    id: 'edges',
    label: 'Edges',
    description: 'Valuables on the border, interior is cheap.',
    icon: 'Square',
    generate: edgesTemplate,
  },
];
