import { cellKey, getWeight, manhattan, neighbors, sameCell } from "../maze.js";
import { createCounters, finishResult, MinHeap, snapshotCounters, validateSearchInput } from "./common.js";

/**
 * A*: f(n) = g(n) + h(n)
 * g: 지금까지의 실제 이동 비용
 * h: 목표까지의 예상 비용 (맨해튼 거리)
 * 4방향 격자에서 칸 비용이 1 이상이면 이 휴리스틱은 허용 가능하다.
 */
export function runAStar(maze, options = {}) {
  const recordSteps = Boolean(options.recordSteps);
  const invalid = validateSearchInput(maze, "astar.js::runAStar");
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
  const startH = heuristic(maze.start);
  const heap = new MinHeap((a, b) => a.f - b.f || a.h - b.h || a.row - b.row || a.col - b.col);
  heap.push({
    row: maze.start.row,
    col: maze.start.col,
    g: 0,
    h: startH,
    f: startH,
  });
  const steps = recordSteps ? [] : null;
  let found = false;
  m.heapPushes = 1;

  while (!heap.isEmpty()) {
    const current = heap.pop();
    m.heapPops += 1;
    const key = cellKey(current.row, current.col);
    if (closed.has(key)) continue;
    if ((gScore.get(key) ?? Infinity) !== current.g) continue;

    closed.add(key);
    m.expanded.add(key);
    m.openCount = Math.max(0, m.openCount - 1);
    m.peakFrontier = Math.max(m.peakFrontier, m.openCount);

    if (recordSteps) {
      const frontier = uniqueFrontier(heap, closed);
      steps.push({
        current: { row: current.row, col: current.col },
        visitedAdd: { row: current.row, col: current.col },
        frontier,
        scores: { g: current.g, h: current.h, f: current.f },
        event: sameCell(current, maze.start) ? "start" : "visit",
        reason: astarReason(current, maze),
        detail: astarDetail(current, maze, frontier.length),
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
      if (g < (gScore.get(nextKey) ?? Infinity)) {
        const h = heuristic(next);
        if (!seen) {
          m.discovered.add(nextKey);
          m.openCount += 1;
        } else {
          improved += 1;
        }
        gScore.set(nextKey, g);
        parent.set(nextKey, key);
        heap.push({ row: next.row, col: next.col, g, h, f: g + h });
        m.heapPushes += 1;
        m.peakFrontier = Math.max(m.peakFrontier, m.openCount);
      }
    }
  }

  const snap = snapshotCounters(m);
  return finishResult(maze, m.expanded, parent, found, steps, {
    searchMode: "astar",
    solver: "astar.js::runAStar",
    heapOps: m.heapPushes + m.heapPops,
    ...snap,
    heuristicEvals,
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

function uniqueFrontier(heap, closed) {
  const seen = new Set();
  const cells = [];
  for (const item of heap.data) {
    const key = cellKey(item.row, item.col);
    if (closed.has(key) || seen.has(key)) continue;
    seen.add(key);
    cells.push({ row: item.row, col: item.col });
  }
  return cells;
}

function astarReason(current, maze) {
  if (sameCell(current, maze.start)) {
    return `시작점에서는 아직 이동하지 않았습니다. g=0, 목표까지 예상 h=${current.h}, 그래서 f=${current.f}입니다.`;
  }
  if (sameCell(current, maze.end)) {
    return `f(n)=g(n)+h(n)이 가장 작은 칸을 따라가다 목표에 도착했습니다. 실제 이동 비용 g=${current.g}입니다.`;
  }
  return `현재까지 이동한 비용(g=${current.g})과 목표까지 예상 비용(h=${current.h})을 더한 f=${current.f}가 가장 작은 칸을 선택합니다.`;
}

function astarDetail(current, maze) {
  return [
    `g(n)=${current.g} : 시작점에서 이 칸까지 실제로 든 이동 비용입니다.`,
    `h(n)=${current.h} : 가로·세로로 목표까지 남은 칸 수(맨해튼 거리)입니다. 벽은 아직 모르는 척하는 낙관적인 예상입니다.`,
    `f(n)=${current.f} : 둘을 더한 값이고, A*는 이 점수가 가장 작은 칸부터 열어 봅니다.`,
    "Dijkstra는 g만 보고, A*는 “목표 쪽으로 얼마나 가까운지”까지 함께 봅니다.",
  ].join(" ");
}
