import { cellKey, neighbors, sameCell } from "../maze.js";
import { createCounters, finishResult, snapshotCounters, validateSearchInput } from "./common.js";

/**
 * BFS: 큐를 사용해 시작점에서 가까운 칸부터 같은 거리 순서로 탐색한다.
 * 모든 간선 비용이 1이면 최단 경로를 찾는다.
 * 큐는 배열 + 머리 인덱스로 둔다 (shift의 O(n) 이동 없이 같은 FIFO 순서).
 */
export function runBFS(maze, options = {}) {
  const recordSteps = Boolean(options.recordSteps);
  const invalid = validateSearchInput(maze, "bfs.js::runBFS");
  if (invalid) return invalid;

  const startKey = cellKey(maze.start.row, maze.start.col);
  const m = createCounters();
  m.discovered.add(startKey);
  const parent = new Map();
  const dist = new Map([[startKey, 0]]);
  const queue = [{ row: maze.start.row, col: maze.start.col }];
  let head = 0;
  const steps = recordSteps ? [] : null;
  let found = false;
  let expandedCount = 0;
  let reencountered = 0;
  m.queuePushes = 1;
  m.peakFrontier = 1;

  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    m.queuePops += 1;
    const key = cellKey(current.row, current.col);
    m.expanded.add(key);
    const distance = dist.get(key) ?? 0;
    m.peakFrontier = Math.max(m.peakFrontier, queue.length - head);

    if (recordSteps) {
      const frontier = queue.slice(head).map((cell) => ({ row: cell.row, col: cell.col }));
      steps.push({
        current: { row: current.row, col: current.col },
        visitedAdd: { row: current.row, col: current.col },
        frontier,
        event: sameCell(current, maze.start) ? "start" : "visit",
        reason: bfsReason(current, maze, distance),
        detail: bfsDetail(current, maze, distance, frontier.length),
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
      if (m.discovered.has(nextKey)) {
        reencountered += 1;
        continue;
      }
      m.discovered.add(nextKey);
      parent.set(nextKey, key);
      dist.set(nextKey, distance + 1);
      queue.push({ row: next.row, col: next.col });
      m.queuePushes += 1;
      m.peakFrontier = Math.max(m.peakFrontier, queue.length - head);
    }
  }

  const snap = snapshotCounters(m);
  return finishResult(maze, m.expanded, parent, found, steps, {
    searchMode: "bfs",
    solver: "bfs.js::runBFS",
    ...snap,
    queueOps: m.queuePushes + m.queuePops,
    skipPath: options.skipPath,
    v2: {
      discoveredCount: m.discovered.size,
      expandedCount,
      generatedCount: m.generatedNodes,
      reencounteredCount: reencountered,
      expansionUnit: "cells",
    },
  });
}

function bfsReason(current, maze, distance) {
  if (sameCell(current, maze.start)) {
    return "시작점에서 탐색을 시작합니다. BFS는 가까운 칸부터 차례대로 봅니다.";
  }
  if (sameCell(current, maze.end)) {
    return `시작점에서 ${distance}칸 떨어진 목표를 찾았습니다. 같은 거리의 칸을 모두 본 뒤에야 더 먼 칸으로 갑니다.`;
  }
  return `시작점에서 같은 거리(${distance})에 있는 칸들을 먼저 탐색합니다.`;
}

function bfsDetail(current, maze, distance, frontierCount) {
  return `(${current.row}, ${current.col})은 시작점에서 ${distance}만큼 떨어진 칸입니다. BFS는 큐의 앞에서부터 꺼내므로 거리 0, 1, 2… 순서로 물결처럼 퍼집니다. 지금 대기 중인 후보는 ${frontierCount}개입니다.`;
}
