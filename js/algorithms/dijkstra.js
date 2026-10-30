import { cellKey, getWeight, neighbors, sameCell } from "../maze.js";
import { createCounters, finishResult, MinHeap, snapshotCounters, validateSearchInput } from "./common.js";

/**
 * Dijkstra: 시작점에서 현재까지 누적 이동 비용이 가장 작은 칸을 고른다.
 * 음수 가중치는 사용하지 않는다. 모든 비용이 1이면 BFS와 같은 최단 거리를 찾는다.
 */
export function runDijkstra(maze, options = {}) {
  const recordSteps = Boolean(options.recordSteps);
  const invalid = validateSearchInput(maze, "dijkstra.js::runDijkstra");
  if (invalid) return invalid;
  let expandedCount = 0;
  let reencountered = 0;
  let improved = 0;

  const startKey = cellKey(maze.start.row, maze.start.col);
  const dist = new Map([[startKey, 0]]);
  const parent = new Map();
  const settled = new Set();
  const m = createCounters();
  m.discovered.add(startKey);
  m.openCount = 1;
  m.peakFrontier = 1;
  const heap = new MinHeap((a, b) => a.dist - b.dist || a.row - b.row || a.col - b.col);
  heap.push({ row: maze.start.row, col: maze.start.col, dist: 0 });
  const steps = recordSteps ? [] : null;
  let found = false;
  m.heapPushes = 1;

  while (!heap.isEmpty()) {
    const current = heap.pop();
    m.heapPops += 1;
    const key = cellKey(current.row, current.col);
    if (settled.has(key)) continue;
    if ((dist.get(key) ?? Infinity) !== current.dist) continue;

    settled.add(key);
    m.expanded.add(key);
    m.openCount = Math.max(0, m.openCount - 1);
    m.peakFrontier = Math.max(m.peakFrontier, m.openCount);

    if (recordSteps) {
      const frontier = uniqueFrontier(heap, settled);
      steps.push({
        current: { row: current.row, col: current.col },
        visitedAdd: { row: current.row, col: current.col },
        frontier,
        scores: { g: current.dist, h: null, f: current.dist },
        event: sameCell(current, maze.start) ? "start" : "visit",
        reason: dijkstraReason(current, maze),
        detail: dijkstraDetail(current, maze, frontier.length),
      });
    }

    if (sameCell(current, maze.end)) {
      found = true;
      break;
    }

    expandedCount += 1;
    for (const next of neighbors(maze, current.row, current.col)) {
      m.generatedNodes += 1;
      const nextKey = cellKey(next.row, next.col);
      const seen = m.discovered.has(nextKey);
      if (seen) reencountered += 1;
      if (settled.has(nextKey)) continue;
      const candidate = current.dist + getWeight(maze, next.row, next.col);
      if (candidate < (dist.get(nextKey) ?? Infinity)) {
        if (!seen) {
          m.discovered.add(nextKey);
          m.openCount += 1;
        } else {
          improved += 1;
        }
        dist.set(nextKey, candidate);
        parent.set(nextKey, key);
        heap.push({ row: next.row, col: next.col, dist: candidate });
        m.heapPushes += 1;
        m.peakFrontier = Math.max(m.peakFrontier, m.openCount);
      }
    }
  }

  const snap = snapshotCounters(m);
  return finishResult(maze, m.expanded, parent, found, steps, {
    searchMode: "dijkstra",
    solver: "dijkstra.js::runDijkstra",
    heapOps: m.heapPushes + m.heapPops,
    ...snap,
    queueOps: null,
    skipPath: options.skipPath,
    v2: {
      discoveredCount: m.discovered.size,
      expandedCount,
      generatedCount: m.generatedNodes,
      reencounteredCount: reencountered,
      improvedCount: improved,
      expansionUnit: "cells",
    },
  });
}

function uniqueFrontier(heap, settled) {
  const seen = new Set();
  const cells = [];
  for (const item of heap.data) {
    const key = cellKey(item.row, item.col);
    if (settled.has(key) || seen.has(key)) continue;
    seen.add(key);
    cells.push({ row: item.row, col: item.col });
  }
  return cells;
}

function dijkstraReason(current, maze) {
  if (sameCell(current, maze.start)) {
    return "시작점의 누적 비용은 0입니다. 이제 비용이 가장 작은 칸부터 열어 봅니다.";
  }
  if (sameCell(current, maze.end)) {
    return `목표까지의 누적 비용 ${current.dist}이(가) 현재 후보 중 가장 작아 목표를 확정했습니다.`;
  }
  return `지금까지 이동하는 데 필요한 비용이 가장 작은 칸을 선택합니다. 이 칸의 누적 비용은 ${current.dist}입니다.`;
}

function dijkstraDetail(current, maze, frontierCount) {
  const weight = maze.weights[current.row][current.col] || 1;
  return `(${current.row}, ${current.col})에 들어오는 비용은 ${weight}이고, 시작점에서 여기까지의 합은 ${current.dist}입니다. Dijkstra는 “앞으로 얼마나 남았는지”는 보지 않고, 지금까지의 실제 비용만 비교합니다. 남은 후보는 ${frontierCount}개입니다.`;
}
