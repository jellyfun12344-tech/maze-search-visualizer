import { finishResult, hiresNow, unsupportedCostResult, validateSearchInput } from "./common.js";

const D4 = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * TIER — 행 비트열 전파
 *
 * 그래프의 정점 큐를 쓰지 않는다.
 * 각 행의 빈 칸을 비트로 겹쳐 두고, 한 세대마다
 * 그 비트열을 왼쪽·오른쪽·위·아래로 한 칸만 민다.
 * 세대 번호가 곧 걸음 수이므로, 비용이 모두 1이면 목표 비트가 켜진 길이 최단이다.
 * 비용이 1이 아닌 칸이 있으면 비트 세대가 비용을 표현하지 못하므로,
 * 그 미로만 비용 버킷(Dijkstra)으로 바꾼다.
 */
export function runTIER(maze, options = {}) {
  const invalid = validateSearchInput(maze, "tier.js::runTIER");
  if (invalid) return invalid;
  if (hasUnevenWeight(maze)) {
    const bad = nonBucketWeight(maze);
    if (bad) return unsupportedCostResult("tier.js::runCostBuckets", bad);
    return runCostBuckets(maze, options);
  }
  return runRowBits(maze, options);
}

/** 비용 버킷은 정수 번호 통을 쓴다. 음수·소수 비용은 통 번호가 될 수 없다. */
function nonBucketWeight(maze) {
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      if (maze.cells[r][c] === 1) continue;
      const w = maze.weights[r][c] || 1;
      if (!Number.isInteger(w) || w < 1) return `weight ${w} at (${r},${c}) is not a positive integer`;
    }
  }
  return null;
}

function hasUnevenWeight(maze) {
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      if (maze.cells[r][c] !== 1 && (maze.weights[r][c] || 1) !== 1) return true;
    }
  }
  return false;
}

function runRowBits(maze, options) {
  const recordSteps = Boolean(options.recordSteps);
  const rows = maze.rows;
  const cols = maze.cols;
  const words = Math.max(1, Math.ceil(cols / 32));
  const lastMask = cols % 32 === 0 ? 0xffffffff : ((1 << (cols % 32)) - 1) >>> 0;
  const n = rows * cols;
  const wall = maze.cells;
  const start = maze.start.row * cols + maze.start.col;
  const goal = maze.end.row * cols + maze.end.col;
  const sr = (start / cols) | 0;
  const sc = start - sr * cols;
  const gr = (goal / cols) | 0;
  const gc = goal - gr * cols;

  const open = new Uint32Array(rows * words);
  for (let r = 0; r < rows; r += 1) {
    const base = r * words;
    for (let c = 0; c < cols; c += 1) {
      if (wall[r][c] === 1) continue;
      open[base + (c >>> 5)] |= 1 << (c & 31);
    }
  }

  const dist = new Int32Array(n);
  dist.fill(-1);
  const parent = new Int32Array(n);
  parent.fill(-1);
  const side = new Uint8Array(n);
  const front = [new Uint32Array(rows * words), new Uint32Array(rows * words)];
  const all = [new Uint32Array(rows * words), new Uint32Array(rows * words)];
  const scratch = [new Uint32Array(rows * words), new Uint32Array(rows * words)];

  dist[start] = 0;
  side[start] = 1;
  setGridBit(front[0], words, sr, sc);
  setGridBit(all[0], words, sr, sc);
  let discovered = 1;
  let expanded = 0;
  let generatedNodes = 0;
  const stats = {
    bitsetOperations: 0,
    bitShifts: 0,
    bitAnds: 0,
    bitOrs: 0,
    generations: 0,
    maxActiveRows: 0,
    maxActiveBits: 0,
  };
  let peakFrontier = 1;
  let found = start === goal;
  let meetA = start;
  let meetB = start;

  if (!found) {
    dist[goal] = 0;
    side[goal] = 2;
    setGridBit(front[1], words, gr, gc);
    setGridBit(all[1], words, gr, gc);
    discovered += 1;
  }

  const steps = recordSteps ? [] : null;
  if (recordSteps) steps.push(bitStep(start, cols, 0, "시작 행의 비트를 켜고, 한 세대에 이웃 한 칸만 민다."));

  for (let gen = 0; gen < n && !found; gen += 1) {
    stats.generations += 1;
    const grew = [false, false];
    for (let s = 0; s < 2; s += 1) {
      const hit = spread(s, 1 - s, gen, rows, cols, words, lastMask, open, front, all, dist, side, scratch, stats);
      expanded += hit.expanded;
      generatedNodes += hit.generated;
      discovered += hit.born;
      peakFrontier = Math.max(peakFrontier, hit.expanded, hit.born);
      if (hit.grew) grew[s] = true;
      if (recordSteps) {
        for (const id of hit.ids) steps.push(bitStep(id, cols, gen + 1, `${s === 0 ? "시작" : "목표"} 쪽에서 ${gen + 1}번째 세대에 켜진 비트입니다.`));
      }
      if (hit.meetA >= 0) {
        meetA = hit.meetA;
        meetB = hit.meetB;
        found = true;
        break;
      }
    }
    if (found) break;
    if (!grew[0] && !grew[1]) break;
  }

  const parentMap = new Map();
  const tPath = hiresNow();
  if (found && start !== goal && !options.skipPath) {
    const chain = stitch(meetA, meetB, start, goal, dist, side, rows, cols, n);
    if (chain.length && chain[0] === start && chain[chain.length - 1] === goal) {
      for (let i = 1; i < chain.length; i += 1) {
        parentMap.set(keyOf(chain[i], cols), keyOf(chain[i - 1], cols));
      }
    } else {
      found = false;
    }
  }
  const pathPrepMs = hiresNow() - tPath;

  const seeds = start === goal ? 1 : 2;
  const v2 = {
    discoveredCount: discovered,
    expandedCount: start === goal ? 0 : expanded,
    generatedCount: generatedNodes,
    reencounteredCount: generatedNodes - (discovered - seeds),
    expansionUnit: "cell-bits",
    generatedUnit: "candidate-bits-per-generation",
  };
  if (start === goal) expanded = 1;

  return finishResult(maze, { size: expanded }, parentMap, found, steps, {
    v2,
    pathPrepMs,
    searchMode: "row-bits",
    solver: "tier.js::runRowBits",
    discoveredCells: discovered,
    discoveredNodes: discovered,
    expandedNodes: expanded,
    generatedNodes,
    newlyDiscovered: discovered,
    bitsetOperations: stats.bitsetOperations,
    bitShifts: stats.bitShifts,
    bitAnds: stats.bitAnds,
    bitOrs: stats.bitOrs,
    generations: stats.generations,
    activeRows: stats.maxActiveRows,
    activeBits: stats.maxActiveBits,
    peakFrontier,
    queueOps: null,
    skipPath: options.skipPath,
    visitedUnit: "cells",
    pathLengthSource: "reconstructed-cells",
  });
}

function spread(sideIndex, otherIndex, gen, rows, cols, words, lastMask, open, front, all, dist, side, scratch, stats) {
  const src = front[sideIndex];
  const dst = all[otherIndex];
  const next = scratch[sideIndex];
  next.fill(0);
  let born = 0;
  let grew = false;
  let expandedFront = 0;
  let meetA = -1;
  let meetB = -1;
  let bestExtra = 0x3fffffff;
  const ids = [];
  const rowBits = new Uint32Array(words);
  let activeRows = 0;
  let activeBits = 0;

  for (let r = 0; r < rows; r += 1) {
    const base = r * words;
    let any = false;
    for (let w = 0; w < words; w += 1) {
      if (stats) stats.bitsetOperations += 1;
      const cur = src[base + w];
      expandedFront += popcnt32(cur);
      const prev = w > 0 ? src[base + w - 1] : 0;
      const after = w + 1 < words ? src[base + w + 1] : 0;
      let bits = ((cur << 1) | (prev >>> 31)) >>> 0;
      if (stats) {
        stats.bitShifts += 2;
        stats.bitOrs += 1;
      }
      bits |= (cur >>> 1) | ((after & 1) << 31);
      if (stats) {
        stats.bitShifts += 2;
        stats.bitOrs += 1;
        stats.bitAnds += 1;
      }
      if (r > 0) {
        bits |= src[(r - 1) * words + w];
        if (stats) stats.bitOrs += 1;
      }
      if (r + 1 < rows) {
        bits |= src[(r + 1) * words + w];
        if (stats) stats.bitOrs += 1;
      }
      bits &= open[base + w];
      if (stats) stats.bitAnds += 1;
      if (w === words - 1) {
        bits &= lastMask;
        if (stats) stats.bitAnds += 1;
      }
      rowBits[w] = bits >>> 0;
      if (rowBits[w]) {
        any = true;
        activeBits += popcnt32(rowBits[w]);
      }
    }
    if (any) activeRows += 1;
    if (!any) continue;

    forEachRowBits(rowBits, words, cols, (c, w, bit) => {
      if ((dst[base + w] & bit) === 0) return;
      const id = r * cols + c;
      const extra = dist[id];
      if (extra >= bestExtra) return;
      bestExtra = extra;
      const from = neighborAt(r, c, rows, cols, dist, side, gen, sideIndex + 1);
      if (sideIndex === 0) {
        meetA = from;
        meetB = id;
      } else {
        meetA = id;
        meetB = from;
      }
    });

    let freshAny = false;
    for (let w = 0; w < words; w += 1) {
      const fresh = (rowBits[w] & ~all[0][base + w] & ~all[1][base + w]) >>> 0;
      rowBits[w] = fresh;
      if (fresh) freshAny = true;
    }
    if (!freshAny) continue;
    grew = true;
    for (let w = 0; w < words; w += 1) next[base + w] = rowBits[w];
    forEachRowBits(rowBits, words, cols, (c) => {
      const id = r * cols + c;
      dist[id] = gen + 1;
      side[id] = sideIndex + 1;
      born += 1;
      ids.push(id);
    });
  }

  for (let i = 0; i < next.length; i += 1) {
    all[sideIndex][i] |= next[i];
    front[sideIndex][i] = next[i];
  }
  if (stats) {
    stats.maxActiveRows = Math.max(stats.maxActiveRows, activeRows);
    stats.maxActiveBits = Math.max(stats.maxActiveBits, activeBits);
  }
  return { born, grew, meetA, meetB, ids, expanded: expandedFront, generated: activeBits };
}

function popcnt32(x) {
  x >>>= 0;
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function neighborAt(r, c, rows, cols, dist, side, wantDist, wantSide) {
  for (let d = 0; d < 4; d += 1) {
    const rr = r + D4[d][0];
    const cc = c + D4[d][1];
    if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
    const id = rr * cols + cc;
    if (dist[id] === wantDist && side[id] === wantSide) return id;
  }
  return -1;
}

function stitch(meetA, meetB, start, goal, dist, side, rows, cols, n) {
  const forward = walkTo(meetA, start, dist, side, rows, cols, n);
  const backward = walkTo(meetB, goal, dist, side, rows, cols, n).reverse();
  if (!forward.length || !backward.length) return [];
  if (forward[forward.length - 1] === backward[0]) backward.shift();
  return forward.concat(backward);
}

function walkTo(from, origin, dist, side, rows, cols, n) {
  const chain = [];
  let cur = from;
  let safe = n + 2;
  const wantSide = side[from];
  while (cur !== -1 && safe-- > 0) {
    chain.push(cur);
    if (cur === origin) {
      chain.reverse();
      return chain;
    }
    const r = (cur / cols) | 0;
    const c = cur - r * cols;
    cur = neighborAt(r, c, rows, cols, dist, side, dist[cur] - 1, wantSide);
  }
  return [];
}

function runCostBuckets(maze, options) {
  const recordSteps = Boolean(options.recordSteps);
  const rows = maze.rows;
  const cols = maze.cols;
  const n = rows * cols;
  const wall = maze.cells;
  const weight = maze.weights;
  const start = maze.start.row * cols + maze.start.col;
  const goal = maze.end.row * cols + maze.end.col;
  const dist = new Int32Array(n);
  dist.fill(0x3fffffff);
  dist[start] = 0;
  const parent = new Int32Array(n);
  parent.fill(-1);
  const buckets = [];
  let cursor = 0;
  pushBucket(buckets, 0, start);
  const steps = recordSteps ? [] : null;
  let expanded = 0;
  let expandedCount = 0;
  let discovered = 1;
  let generatedNodes = 0;
  let reencountered = 0;
  let improved = 0;
  let found = false;
  const settledCell = new Uint8Array(n);

  while (cursor < buckets.length) {
    const bucket = buckets[cursor];
    if (!bucket || !bucket.length) {
      cursor += 1;
      continue;
    }
    const id = bucket.pop();
    if (dist[id] !== cursor || settledCell[id]) continue;
    settledCell[id] = 1;
    expanded += 1;
    if (recordSteps) steps.push(bitStep(id, cols, cursor, `비용 합이 ${cursor}인 칸을 확정합니다.`));
    if (id === goal) {
      found = true;
      break;
    }
    expandedCount += 1;
    const r = (id / cols) | 0;
    const c = id - r * cols;
    for (let d = 0; d < 4; d += 1) {
      const rr = r + D4[d][0];
      const cc = c + D4[d][1];
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols || wall[rr][cc] === 1) continue;
      generatedNodes += 1;
      const nid = rr * cols + cc;
      const seen = dist[nid] !== 0x3fffffff;
      if (seen) reencountered += 1;
      const ng = cursor + (weight[rr][cc] || 1);
      if (ng >= dist[nid]) continue;
      if (!seen) discovered += 1;
      else improved += 1;
      dist[nid] = ng;
      parent[nid] = id;
      pushBucket(buckets, ng, nid);
    }
  }

  const parentMap = new Map();
  const tPath = hiresNow();
  if (found && start !== goal && !options.skipPath) {
    let cur = goal;
    let safe = n + 2;
    while (cur !== start && parent[cur] !== -1 && safe-- > 0) {
      parentMap.set(keyOf(cur, cols), keyOf(parent[cur], cols));
      cur = parent[cur];
    }
    if (cur !== start) found = false;
  }
  const pathPrepMs = hiresNow() - tPath;
  return finishResult(maze, { size: expanded }, parentMap, found, steps, {
    pathPrepMs,
    searchMode: "cost-buckets",
    solver: "tier.js::runCostBuckets",
    discoveredCells: discovered,
    discoveredNodes: discovered,
    expandedNodes: expanded,
    generatedNodes,
    v2: {
      discoveredCount: discovered,
      expandedCount,
      generatedCount: generatedNodes,
      reencounteredCount: reencountered,
      improvedCount: improved,
      expansionUnit: "cells",
    },
    bitsetOperations: 0,
    queueOps: null,
    skipPath: options.skipPath,
    visitedUnit: "cells",
    pathLengthSource: "reconstructed-cells",
  });
}

function pushBucket(buckets, cost, id) {
  let bucket = buckets[cost];
  if (!bucket) {
    bucket = [];
    buckets[cost] = bucket;
  }
  bucket.push(id);
}

function setGridBit(grid, words, r, c) {
  grid[r * words + (c >>> 5)] |= 1 << (c & 31);
}

function forEachRowBits(rowBits, words, cols, fn) {
  for (let w = 0; w < words; w += 1) {
    let x = rowBits[w] >>> 0;
    while (x) {
      const bit = 31 - Math.clz32(x & -x);
      const c = (w << 5) + bit;
      if (c < cols) fn(c, w, 1 << bit);
      x = (x & (x - 1)) >>> 0;
    }
  }
}

function keyOf(id, cols) {
  const r = (id / cols) | 0;
  return `${r},${id - r * cols}`;
}

function bitStep(id, cols, gen, reason) {
  const r = (id / cols) | 0;
  return {
    current: { row: r, col: id - r * cols },
    visitedAdd: { row: r, col: id - r * cols },
    frontier: [],
    event: gen === 0 ? "start" : "visit",
    reason,
    detail: `이 칸은 ${gen}번째 세대에 켜졌습니다. 한 세대는 한 걸음이라, 비용이 1이면 이 세대 수가 최단 거리입니다.`,
  };
}
