import { exceedsCellLimit, getCell, getWeight } from "../maze.js";
import { emptySearchResult, finishResult, hiresNow, validateSearchInput } from "./common.js";
import { runBFS } from "./bfs.js";

const D4 = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * Bit-parallel BFS (BP-BFS)
 *
 * 이미 있는 방법이다. 칸을 큐에서 하나씩 꺼내지 않고,
 * 한 행의 프론티어를 32비트 단어로 묶어 왼쪽·오른쪽·위·아래로 한 칸씩 민다.
 * 세대 번호가 곧 걸음 수이므로, 비용이 모두 1이면 최단이다.
 * TIER와 달리 한쪽에서만 퍼진다.
 */
export function runBPBFS(maze, options = {}) {
  const invalid = validateSearchInput(maze, "bpbfs.js::runBPBFS");
  if (invalid) return invalid;
  if (exceedsCellLimit(maze.rows, maze.cols, 8_000_000)) {
    return { ...emptySearchResult("not-run"), measured: false, solver: "bpbfs.js::runBPBFS", searchMode: "not-run:maze-too-large" };
  }
  if (hasUnevenWeight(maze)) {
    const result = runBFS(maze, options);
    return { ...result, searchMode: "weighted-bfs-fallback", solver: "bpbfs.js::runBFSFallback" };
  }
  return runBits(maze, options);
}

function hasUnevenWeight(maze) {
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      if (getCell(maze, r, c) !== 1 && getWeight(maze, r, c) !== 1) return true;
    }
  }
  return false;
}

function runBits(maze, options) {
  const recordSteps = Boolean(options.recordSteps);
  const rows = maze.rows;
  const cols = maze.cols;
  const words = Math.max(1, Math.ceil(cols / 32));
  const lastMask = cols % 32 === 0 ? 0xffffffff : ((1 << (cols % 32)) - 1) >>> 0;
  const n = rows * cols;
  const start = maze.start.row * cols + maze.start.col;
  const goal = maze.end.row * cols + maze.end.col;

  const open = new Uint32Array(rows * words);
  for (let r = 0; r < rows; r += 1) {
    const base = r * words;
    for (let c = 0; c < cols; c += 1) {
      if (getCell(maze, r, c) === 1) continue;
      open[base + (c >>> 5)] |= 1 << (c & 31);
    }
  }

  const reach = new Uint32Array(rows * words);
  const front = new Uint32Array(rows * words);
  const next = new Uint32Array(rows * words);
  const dist = new Int32Array(n);
  dist.fill(-1);

  dist[start] = 0;
  setBit(front, words, maze.start.row, maze.start.col);
  setBit(reach, words, maze.start.row, maze.start.col);
  let discovered = 1;
  let expanded = start === goal ? 1 : 0;
  let generatedNodes = 0;
  let peakFrontier = 1;
  let found = start === goal;
  const steps = recordSteps ? [] : null;
  if (recordSteps) {
    steps.push(makeStep(maze.start, 0, "시작 칸의 비트를 켠다. 한 세대에 이웃 네 칸을 한꺼번에 민다."));
  }

  for (let gen = 0; gen < n && !found; gen += 1) {
    next.fill(0);
    let grew = false;
    let frontCount = 0;
    for (let r = 0; r < rows; r += 1) {
      const base = r * words;
      for (let w = 0; w < words; w += 1) {
        const cur = front[base + w];
        frontCount += popcnt32(cur);
        const prev = w > 0 ? front[base + w - 1] : 0;
        const after = w + 1 < words ? front[base + w + 1] : 0;
        let bits = ((cur << 1) | (prev >>> 31)) >>> 0;
        bits |= (cur >>> 1) | ((after & 1) << 31);
        if (r > 0) bits |= front[(r - 1) * words + w];
        if (r + 1 < rows) bits |= front[(r + 1) * words + w];
        bits &= open[base + w];
        generatedNodes += popcnt32(bits);
        bits &= ~reach[base + w];
        if (w === words - 1) bits &= lastMask;
        next[base + w] = bits >>> 0;
        if (bits) grew = true;
      }
    }
    expanded += frontCount;
    peakFrontier = Math.max(peakFrontier, frontCount);
    if (!grew) break;

    for (let r = 0; r < rows; r += 1) {
      const base = r * words;
      for (let w = 0; w < words; w += 1) {
        let x = next[base + w];
        while (x) {
          const bit = 31 - Math.clz32(x & -x);
          const c = (w << 5) + bit;
          if (c < cols) {
            const id = r * cols + c;
            dist[id] = gen + 1;
            discovered += 1;
            if (recordSteps) {
              steps.push(makeStep({ row: r, col: c }, gen + 1, `${gen + 1}번째 세대에 켜진 비트입니다.`));
            }
            if (id === goal) found = true;
          }
          x = (x & (x - 1)) >>> 0;
        }
        reach[base + w] |= next[base + w];
      }
    }
    front.set(next);
    if (found) break;
  }

  const parent = new Map();
  const tPath = hiresNow();
  if (found && start !== goal && !options.skipPath) {
    let cur = goal;
    let safe = n + 2;
    while (cur !== start && safe-- > 0) {
      const r = (cur / cols) | 0;
      const c = cur - r * cols;
      const prev = prevAt(r, c, rows, cols, dist);
      if (prev < 0) {
        found = false;
        break;
      }
      parent.set(`${r},${c}`, keyOf(prev, cols));
      cur = prev;
    }
    if (cur !== start) found = false;
  }
  const pathPrepMs = hiresNow() - tPath;

  return finishResult(maze, { size: expanded }, parent, found, steps, {
    pathPrepMs,
    searchMode: "bit-parallel-bfs",
    solver: "bpbfs.js::runBPBFS",
    discoveredNodes: discovered,
    expandedNodes: expanded,
    generatedNodes,
    peakFrontier,
    skipPath: options.skipPath,
    v2: {
      discoveredCount: discovered,
      expandedCount: start === goal ? 0 : expanded,
      generatedCount: generatedNodes,
      reencounteredCount: generatedNodes - (discovered - 1),
      expansionUnit: "cell-bits",
      generatedUnit: "candidate-bits-per-generation",
    },
  });
}

function popcnt32(x) {
  x >>>= 0;
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function prevAt(r, c, rows, cols, dist) {
  const want = dist[r * cols + c] - 1;
  for (let d = 0; d < 4; d += 1) {
    const rr = r + D4[d][0];
    const cc = c + D4[d][1];
    if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
    const id = rr * cols + cc;
    if (dist[id] === want) return id;
  }
  return -1;
}

function setBit(grid, words, r, c) {
  grid[r * words + (c >>> 5)] |= 1 << (c & 31);
}

function keyOf(id, cols) {
  const r = (id / cols) | 0;
  return `${r},${id - r * cols}`;
}

function makeStep(cell, gen, reason) {
  return {
    current: { ...cell },
    visitedAdd: { ...cell },
    frontier: [],
    event: gen === 0 ? "start" : "visit",
    reason,
    detail: `이 칸은 ${gen}번째 세대에 켜졌습니다. 한 세대는 한 걸음이라, 비용이 1이면 세대 수가 최단 거리입니다.`,
  };
}
