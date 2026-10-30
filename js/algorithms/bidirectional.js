import { cellKey, getWeight, neighbors, sameCell } from "../maze.js";
import { createCounters, finishResult, snapshotCounters, validateSearchInput } from "./common.js";

/**
 * 양방향 BFS.
 * 이전 구현은 큐가 작은 쪽에서 칸을 하나씩 꺼내 처음 만나면 바로 멈췄다.
 * 단위 비용에서 그 종료는 최단을 항상 보장하지 않는다.
 * 지금은 한 쪽의 현재 층을 모두 펼친 뒤, 양쪽 프론티어의 거리 합이
 * 지금까지의 최선 만남보다 짧지 않으면 멈춘다 (μ 하한).
 * 이웃을 고르는 순서(FIFO, 네 방향)는 그대로다. 큐는 배열 + 머리 인덱스다.
 * 비용이 1이 아닌 칸이 있으면 FIFO 순서가 비용 순서가 아니므로 최단 비용을 보장하지 않는다.
 */
export function runBidirectionalBFS(maze, options = {}) {
  const recordSteps = Boolean(options.recordSteps);
  const invalid = validateSearchInput(maze, "bidirectional.js::runBidirectionalBFS");
  if (invalid) return invalid;

  const m = createCounters();
  const startKey = cellKey(maze.start.row, maze.start.col);
  const endKey = cellKey(maze.end.row, maze.end.col);
  m.discovered.add(startKey);
  m.openCount = 1;

  if (sameCell(maze.start, maze.end)) {
    m.expanded.add(startKey);
    m.expandedForward = 1;
    m.peakFrontier = 1;
    return finishResult(maze, m.expanded, new Map(), true, [], {
      searchMode: "bidirectional-bfs",
      solver: "bidirectional.js::runBidirectionalBFS",
      ...snapshotCounters(m),
      queueOps: 0,
      skipPath: options.skipPath,
      v2: { discoveredCount: 1, expandedCount: 0, generatedCount: 0, reencounteredCount: 0, expansionUnit: "cells" },
    });
  }

  m.discovered.add(endKey);
  m.openCount = 2;
  m.peakFrontier = 2;

  const gF = new Map([[startKey, 0]]);
  const gB = new Map([[endKey, 0]]);
  const pF = new Map();
  const pB = new Map();
  const closedF = new Set();
  const closedB = new Set();
  const qF = { items: [{ row: maze.start.row, col: maze.start.col }], head: 0 };
  const qB = { items: [{ row: maze.end.row, col: maze.end.col }], head: 0 };
  const size = (q) => q.items.length - q.head;
  m.queuePushes = 2;
  const steps = recordSteps ? [] : null;
  let bestMeet = null;
  let bestCost = Infinity;
  let sideDiscoveries = 0;
  let reencountered = 0;

  const considerMeet = (key) => {
    if (!gF.has(key) || !gB.has(key)) return;
    const cost = gF.get(key) + gB.get(key);
    if (cost < bestCost) {
      bestCost = cost;
      bestMeet = key;
    }
  };

  const minG = (queue, gMap) => {
    let min = Infinity;
    for (let i = queue.head; i < queue.items.length; i += 1) {
      const node = queue.items[i];
      const g = gMap.get(cellKey(node.row, node.col));
      if (g < min) min = g;
    }
    return min;
  };

  const expandOne = (queue, gThis, parentThis, closedThis, side) => {
    if (!size(queue)) return;
    const current = queue.items[queue.head];
    queue.head += 1;
    m.queuePops += 1;
    const key = cellKey(current.row, current.col);
    if (closedThis.has(key)) return;
    closedThis.add(key);
    m.expanded.add(key);
    m.openCount = Math.max(0, m.openCount - 1);
    if (side === "F") m.expandedForward += 1;
    else m.expandedBackward += 1;
    considerMeet(key);

    if (recordSteps) {
      const pending = [...qF.items.slice(qF.head), ...qB.items.slice(qB.head)];
      steps.push({
        current: { row: current.row, col: current.col },
        visitedAdd: { row: current.row, col: current.col },
        frontier: pending.slice(0, 40).map((n) => ({ row: n.row, col: n.col })),
        event: "visit",
        reason: side === "F" ? "시작 쪽에서 한 층을 넓힙니다." : "목표 쪽에서 한 층을 넓힙니다.",
        detail: "양방향 BFS는 층을 모두 펼친 뒤, 남은 거리 합이 최선 만남보다 짧지 않으면 멈춥니다.",
      });
    }

    const dist = gThis.get(key) ?? 0;
    for (const next of neighbors(maze, current.row, current.col)) {
      m.generatedNodes += 1;
      const nextKey = cellKey(next.row, next.col);
      const seenThisSide = gThis.has(nextKey);
      if (seenThisSide) reencountered += 1;
      if (closedThis.has(nextKey)) continue;
      const ng = dist + getWeight(maze, next.row, next.col);
      if (ng >= (gThis.get(nextKey) ?? Infinity)) continue;
      if (!seenThisSide) sideDiscoveries += 1;
      if (!m.discovered.has(nextKey)) {
        m.discovered.add(nextKey);
        m.openCount += 1;
      }
      gThis.set(nextKey, ng);
      parentThis.set(nextKey, key);
      queue.items.push({ row: next.row, col: next.col });
      m.queuePushes += 1;
      considerMeet(nextKey);
    }
    m.peakFrontier = Math.max(m.peakFrontier, size(qF) + size(qB), m.openCount);
  };

  while (size(qF) && size(qB)) {
    m.peakFrontier = Math.max(m.peakFrontier, size(qF) + size(qB));
    if (bestMeet != null) {
      const bound = minG(qF, gF) + minG(qB, gB);
      if (bound >= bestCost) break;
    }
    if (size(qF) <= size(qB)) {
      const layer = size(qF);
      for (let i = 0; i < layer; i += 1) expandOne(qF, gF, pF, closedF, "F");
    } else {
      const layer = size(qB);
      for (let i = 0; i < layer; i += 1) expandOne(qB, gB, pB, closedB, "B");
    }
  }

  const parent = new Map(pF);
  if (bestMeet) {
    let cursor = bestMeet;
    while (pB.has(cursor)) {
      const next = pB.get(cursor);
      parent.set(next, cursor);
      cursor = next;
    }
  }

  const snap = snapshotCounters(m);
  return finishResult(maze, m.expanded, parent, Boolean(bestMeet), steps, {
    searchMode: "bidirectional-bfs",
    solver: "bidirectional.js::runBidirectionalBFS",
    skipPath: options.skipPath,
    ...snap,
    queueOps: m.queuePushes + m.queuePops,
    discoveredCells: snap.discoveredNodes,
    visitedUnit: "cells",
    pathLengthSource: "reconstructed-cells",
    sideDiscoveries,
    v2: {
      discoveredCount: m.discovered.size,
      expandedCount: m.expanded.size,
      generatedCount: m.generatedNodes,
      reencounteredCount: reencountered,
      expansionUnit: "cells",
    },
  });
}