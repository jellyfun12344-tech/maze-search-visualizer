import { cellKey, getWeight, manhattan, neighbors, sameCell } from "../maze.js";
import { createCounters, finishResult, MinHeap, snapshotCounters, validateSearchInput } from "./common.js";

/** Greedy Best-First: h(n)만 보고 목표 쪽으로 간다. 최단 경로는 보장하지 않는다. */
export function runGreedy(maze, options = {}) {
  const recordSteps = Boolean(options.recordSteps);
  const invalid = validateSearchInput(maze, "greedy.js::runGreedy");
  if (invalid) return invalid;

  let expandedCount = 0;
  let reencountered = 0;
  let improved = 0;
  let heuristicEvals = 0;
  const heuristic = (cell) => {
    heuristicEvals += 1;
    return manhattan(cell, maze.end);
  };
  const startKey = cellKey(maze.start.row, maze.start.col);
  const gScore = new Map([[startKey, 0]]);
  const parent = new Map();
  const closed = new Set();
  const m = createCounters();
  m.discovered.add(startKey);
  m.openCount = 1;
  m.peakFrontier = 1;
  const heap = new MinHeap((a, b) => a.h - b.h || a.g - b.g || a.row - b.row || a.col - b.col);
  heap.push({ row: maze.start.row, col: maze.start.col, g: 0, h: heuristic(maze.start) });
  const steps = recordSteps ? [] : null;
  let found = false;
  m.heapPushes = 1;

  while (!heap.isEmpty()) {
    const current = heap.pop();
    m.heapPops += 1;
    const key = cellKey(current.row, current.col);
    if (closed.has(key)) continue;
    closed.add(key);
    m.expanded.add(key);
    m.openCount = Math.max(0, m.openCount - 1);
    m.peakFrontier = Math.max(m.peakFrontier, m.openCount);
    if (recordSteps) {
      steps.push({
        current: { row: current.row, col: current.col },
        visitedAdd: { row: current.row, col: current.col },
        frontier: heap.data.filter((n) => !closed.has(cellKey(n.row, n.col))).slice(0, 40)
          .map((n) => ({ row: n.row, col: n.col })),
        scores: { g: current.g, h: current.h, f: current.h },
        event: sameCell(current, maze.start) ? "start" : "visit",
        reason: sameCell(current, maze.end)
          ? "목표에 도착했습니다. Greedy는 가까운 쪽으로만 가서 최단 경로는 아닐 수 있습니다."
          : `목표까지 예상 거리 h=${current.h}가 가장 작은 칸을 고릅니다.`,
        detail: "Greedy Best-First는 지금까지의 실제 비용 g는 무시하고, 목표에 가까워 보이는 칸만 봅니다.",
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
      if (closed.has(nextKey)) continue;
      const g = current.g + getWeight(maze, next.row, next.col);
      if (g >= (gScore.get(nextKey) ?? Infinity)) continue;
      const h = heuristic(next);
      if (!seen) {
        m.discovered.add(nextKey);
        m.openCount += 1;
      } else {
        improved += 1;
      }
      gScore.set(nextKey, g);
      parent.set(nextKey, key);
      heap.push({ row: next.row, col: next.col, g, h });
      m.heapPushes += 1;
      m.peakFrontier = Math.max(m.peakFrontier, m.openCount);
    }
  }

  const snap = snapshotCounters(m);
  return finishResult(maze, m.expanded, parent, found, steps, {
    searchMode: "greedy",
    solver: "greedy.js::runGreedy",
    heuristicEvals,
    queueOps: null,
    ...snap,
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
