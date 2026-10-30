import { cellKey, getWeight, manhattan, neighbors, sameCell } from "../maze.js";
import { finishResult, MinHeap, validateSearchInput } from "./common.js";

const T_LOW = 0.33;
const T_HIGH = 0.67;
const START_C = 0.38;

/**
 * AEFS — Adaptive Evidence Frontier Search
 *
 * BFS와 A*를 동시에 돌리는 것이 아니다.
 * 탐색 중 얻은 증거로 신뢰도 C ∈ [0, 1]를 갱신하고,
 * C가 낮으면 BFS 레이어를, 높으면 목표 지향 프론티어를 더 많이 쓴다.
 *
 * discovery: 목표를 처음 꺼냈을 때 종료. 최단 경로를 보장하지 않는다.
 * exact: C는 기록만 하고 확장은 항상 min f(A*). 허용 휴리스틱이면 최단 경로를 유지한다.
 */
export function runAEFS(maze, options = {}) {
  const recordSteps = Boolean(options.recordSteps);
  const mode = options.mode === "exact" ? "exact" : "discovery";
  const quantized = Boolean(options.quantized);
  const quantum = Number(options.quantum) > 0 ? Number(options.quantum) : 1;
  const invalid = validateSearchInput(maze, "aefs.js::runAEFS");
  if (invalid) return invalid;
  let expandedCount = 0;
  let generatedCount = 0;
  let reencountered = 0;
  let improved = 0;

  const startKey = cellKey(maze.start.row, maze.start.col);
  const heuristic = (cell) => manhattan(cell, maze.end);
  let heuristicEvals = 0;
  const hOf = (cell) => {
    heuristicEvals += 1;
    return heuristic(cell);
  };

  const startH = hOf(maze.start);
  const gScore = new Map([[startKey, 0]]);
  const parent = new Map();
  const closed = new Set();
  const startNode = makeNode(maze.start, 0, startH, 0);

  const bfsFront = new LayerFrontier();
  const goalFront = quantized ? new BucketFrontier(quantum) : new HeapFrontier();
  let queueOps = 0;
  const pushBoth = (node) => {
    bfsFront.push(node);
    goalFront.push(node);
    queueOps += 2;
  };
  pushBoth(startNode);

  const steps = recordSteps ? [] : null;
  let C = START_C;
  let strategy = strategyOf(C, mode);
  let prevH = startH;
  let bestH = startH;
  let found = false;
  let peakFrontier = 1;
  let expansions = 0;

  while (!bfsFront.isEmpty() || !goalFront.isEmpty()) {
    strategy = strategyOf(C, mode);
    const current = selectNode(bfsFront, goalFront, C, strategy);
    if (!current) break;
    queueOps += 1;

    const key = cellKey(current.row, current.col);
    if (closed.has(key)) continue;
    if ((gScore.get(key) ?? Infinity) !== current.g) continue;

    closed.add(key);
    expansions += 1;
    peakFrontier = Math.max(peakFrontier, bfsFront.size + goalFront.size);

    const walkable = neighbors(maze, current.row, current.col);
    const unseen = walkable.filter((n) => !closed.has(cellKey(n.row, n.col)));
    const deadEnd = unseen.length === 0 && !sameCell(current, maze.end);
    const improvedBestH = current.h < bestH;
    if (improvedBestH) bestH = current.h;
    const nextC = updateConfidence(C, {
      h: current.h,
      prevH,
      deadEnd,
      improvedBestH,
      openness: walkable.length / 4,
    });
    const nextStrategy = strategyOf(nextC, mode);

    if (recordSteps) {
      const frontier = snapshotFrontier(bfsFront, goalFront, closed, 48);
      const shifted = nextStrategy !== strategy;
      steps.push({
        current: { row: current.row, col: current.col },
        visitedAdd: { row: current.row, col: current.col },
        frontier,
        scores: {
          g: current.g,
          h: current.h,
          f: current.f,
          C: Number(C.toFixed(2)),
        },
        strategy,
        event: sameCell(current, maze.start) ? "start" : shifted ? "shift" : "visit",
        reason: aefsReason(current, maze, C, strategy, shifted, nextStrategy),
        detail: aefsDetail(current, maze, C, strategy, nextC, deadEnd, quantized, mode),
      });
    }

    C = nextC;
    prevH = current.h;

    if (sameCell(current, maze.end)) {
      found = true;
      break;
    }

    expandedCount += 1;
    for (const next of walkable) {
      generatedCount += 1;
      const nextKey = cellKey(next.row, next.col);
      const seen = gScore.has(nextKey);
      if (seen) reencountered += 1;
      if (closed.has(nextKey)) continue;
      const g = current.g + getWeight(maze, next.row, next.col);
      if (g >= (gScore.get(nextKey) ?? Infinity)) continue;
      if (seen) improved += 1;
      const h = hOf(next);
      gScore.set(nextKey, g);
      parent.set(nextKey, key);
      pushBoth(makeNode(next, g, h, current.layer + 1));
    }
  }

  const extras = {
    expansions,
    heuristicEvals,
    queueOps,
    peakFrontier,
    confidenceStart: START_C,
    confidenceEnd: Number(C.toFixed(3)),
    searchMode: mode,
    solver: mode === "exact" ? "aefs.js::runAEFSExact" : quantized ? "aefs.js::runAEFSQ" : "aefs.js::runAEFS",
    quantized,
    energy: null,
    skipPath: options.skipPath,
    discoveredNodes: gScore.size,
    expandedNodes: closed.size,
    generatedNodes: generatedCount,
    v2: {
      discoveredCount: gScore.size,
      expandedCount,
      generatedCount,
      reencounteredCount: reencountered,
      improvedCount: improved,
      expansionUnit: "cells",
    },
  };

  return finishResult(maze, closed, parent, found, steps, extras);
}

export function runAEFSQ(maze, options = {}) {
  return runAEFS(maze, { ...options, quantized: true, quantum: options.quantum ?? 1 });
}

export function runAEFSExact(maze, options = {}) {
  return runAEFS(maze, { ...options, mode: "exact" });
}

function makeNode(cell, g, h, layer) {
  return {
    row: cell.row,
    col: cell.col,
    g,
    h,
    f: g + h,
    layer,
  };
}

function strategyOf(C, mode) {
  if (mode === "exact") return "goal";
  if (C < T_LOW) return "bfs";
  if (C > T_HIGH) return "goal";
  return "mixed";
}

function updateConfidence(C, ctx) {
  let next = C;
  if (ctx.prevH != null) {
    const progress = ctx.prevH - ctx.h;
    if (progress > 0) next += 0.05 * Math.min(2, progress);
    else if (progress < 0) next -= Math.min(0.36, 0.055 * (-progress));
  }
  if (ctx.deadEnd) next -= 0.1;
  if (ctx.improvedBestH) next += 0.04;
  if (ctx.openness < 0.26) next -= 0.03;
  if (ctx.openness > 0.74 && ctx.prevH != null && ctx.prevH > ctx.h) next += 0.02;
  return Math.max(0, Math.min(1, next));
}

function selectNode(bfsFront, goalFront, C, strategy) {
  if (strategy === "bfs") return bfsFront.pop();
  if (strategy === "goal") return goalFront.pop();
  const a = bfsFront.peek();
  const b = goalFront.peek();
  if (!a) return goalFront.pop();
  if (!b) return bfsFront.pop();
  const scoreA = (1 - C) * a.layer + C * a.f;
  const scoreB = (1 - C) * b.layer + C * b.f;
  if (scoreA < scoreB || (scoreA === scoreB && a.h <= b.h)) return bfsFront.pop();
  return goalFront.pop();
}

function snapshotFrontier(bfsFront, goalFront, closed, limit) {
  const seen = new Set();
  const cells = [];
  for (const node of bfsFront.values()) {
    const key = cellKey(node.row, node.col);
    if (closed.has(key) || seen.has(key)) continue;
    seen.add(key);
    cells.push({ row: node.row, col: node.col });
    if (cells.length >= limit) return cells;
  }
  for (const node of goalFront.values()) {
    const key = cellKey(node.row, node.col);
    if (closed.has(key) || seen.has(key)) continue;
    seen.add(key);
    cells.push({ row: node.row, col: node.col });
    if (cells.length >= limit) return cells;
  }
  return cells;
}

function aefsReason(current, maze, C, strategy, shifted, nextStrategy) {
  if (sameCell(current, maze.start)) {
    return `시작점입니다. 아직 증거가 적어 신뢰도 C=${C.toFixed(2)}로 출발합니다.`;
  }
  if (sameCell(current, maze.end)) {
    return `목표를 찾았습니다. 마지막 신뢰도는 C=${C.toFixed(2)}입니다.`;
  }
  if (shifted) {
    return `증거가 바뀌어 전략이 ${labelOf(strategy)}에서 ${labelOf(nextStrategy)}(으)로 전환됩니다. C=${C.toFixed(2)}`;
  }
  if (strategy === "bfs") {
    return `C=${C.toFixed(2)}로 낮아 지금 거리 레이어를 넓게 봅니다. 같은 레이어 안에서는 목표가 가까워 보이는 칸을 먼저 봅니다.`;
  }
  if (strategy === "goal") {
    return `C=${C.toFixed(2)}로 높아 f(n)=g(n)+h(n)이 작은 칸을 목표 쪽으로 고릅니다.`;
  }
  return `C=${C.toFixed(2)}로 중간이라 BFS 거리와 목표 점수를 섞어 칸을 고릅니다.`;
}

function aefsDetail(current, maze, C, strategy, nextC, deadEnd, quantized, mode) {
  const parts = [
    `(${current.row}, ${current.col}) · g=${current.g}, h=${current.h}, f=${current.f}`,
    `신뢰도 C는 휴리스틱이 실제로 목표에 가까워지는지, 막다른 길이 반복되는지를 보고 0과 1 사이에서 움직입니다.`,
    `지금은 ${labelOf(strategy)} 전략이고, 다음 신뢰도는 ${nextC.toFixed(2)}입니다.`,
  ];
  if (deadEnd) parts.push("갈 수 있는 새 칸이 거의 없어 휴리스틱을 덜 믿도록 C를 낮춥니다.");
  if (mode === "exact") {
    parts.push("정확 모드에서는 C가 설명을 바꿀 뿐, 칸을 꺼내는 순서는 A*처럼 항상 f가 작은 칸입니다.");
  } else {
    parts.push("발견 모드는 목표를 빨리 찾는 것이 우선이라 최단 경로를 보장하지 않습니다.");
  }
  if (quantized) {
    parts.push("AEFS-Q는 비슷한 f 값을 같은 버킷에 묶어 우선순위 관리를 단순화합니다.");
  }
  return parts.join(" ");
}

function labelOf(strategy) {
  if (strategy === "bfs") return "BFS형";
  if (strategy === "goal") return "목표 지향";
  return "혼합";
}

class LayerFrontier {
  constructor() {
    this.layers = new Map();
    this.minLayer = Infinity;
    this.count = 0;
  }

  get size() {
    return this.count;
  }

  isEmpty() {
    this.skipEmpty();
    return this.count === 0;
  }

  push(node) {
    const list = this.layers.get(node.layer) || [];
    list.push(node);
    this.layers.set(node.layer, list);
    this.minLayer = Math.min(this.minLayer, node.layer);
    this.count += 1;
  }

  peek() {
    this.skipEmpty();
    const list = this.layers.get(this.minLayer);
    if (!list?.length) return null;
    return list[bestInLayer(list)];
  }

  pop() {
    this.skipEmpty();
    const list = this.layers.get(this.minLayer);
    if (!list?.length) return null;
    const index = bestInLayer(list);
    const [node] = list.splice(index, 1);
    this.count -= 1;
    return node;
  }

  values() {
    const all = [];
    this.layers.forEach((list) => all.push(...list));
    return all;
  }

  skipEmpty() {
    while (this.minLayer !== Infinity) {
      const list = this.layers.get(this.minLayer);
      if (list && list.length) return;
      this.layers.delete(this.minLayer);
      this.minLayer = nextMinKey(this.layers);
    }
  }
}

class HeapFrontier {
  constructor() {
    this.heap = new MinHeap((a, b) => a.f - b.f || a.h - b.h || a.g - b.g || a.row - b.row || a.col - b.col);
  }

  get size() {
    return this.heap.size;
  }

  isEmpty() {
    return this.heap.isEmpty();
  }

  push(node) {
    this.heap.push(node);
  }

  peek() {
    return this.heap.peek() || null;
  }

  pop() {
    return this.heap.pop();
  }

  values() {
    return this.heap.data;
  }
}

class BucketFrontier {
  constructor(quantum) {
    this.quantum = quantum;
    this.buckets = new Map();
    this.minBucket = Infinity;
    this.count = 0;
  }

  get size() {
    return this.count;
  }

  isEmpty() {
    this.skipEmpty();
    return this.count === 0;
  }

  bucketOf(node) {
    return Math.floor(node.f / this.quantum);
  }

  push(node) {
    const id = this.bucketOf(node);
    const list = this.buckets.get(id) || [];
    list.push(node);
    this.buckets.set(id, list);
    this.minBucket = Math.min(this.minBucket, id);
    this.count += 1;
  }

  peek() {
    this.skipEmpty();
    const list = this.buckets.get(this.minBucket);
    return list?.[0] || null;
  }

  pop() {
    this.skipEmpty();
    const list = this.buckets.get(this.minBucket);
    if (!list?.length) return null;
    this.count -= 1;
    return list.shift();
  }

  values() {
    const all = [];
    this.buckets.forEach((list) => all.push(...list));
    return all;
  }

  skipEmpty() {
    while (this.minBucket !== Infinity) {
      const list = this.buckets.get(this.minBucket);
      if (list && list.length) return;
      this.buckets.delete(this.minBucket);
      this.minBucket = nextMinKey(this.buckets);
    }
  }
}

function bestInLayer(list) {
  let best = 0;
  for (let i = 1; i < list.length; i += 1) {
    const a = list[i];
    const b = list[best];
    if (a.h < b.h || (a.h === b.h && a.g < b.g)) best = i;
  }
  return best;
}

function nextMinKey(map) {
  let min = Infinity;
  map.forEach((_value, key) => {
    if (key < min) min = key;
  });
  return min;
}
