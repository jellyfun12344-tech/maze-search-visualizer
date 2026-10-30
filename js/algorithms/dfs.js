import { DIRS, cellKey, inBounds, isWalkable, sameCell } from "../maze.js";
import { createCounters, finishResult, snapshotCounters, validateSearchInput } from "./common.js";

/**
 * DFS: 한 길을 끝까지 들어간 뒤, 막히면 갈림길로 되돌아온다.
 * 재귀와 같은 순서로 동작하도록 스택 프레임에 “다음에 볼 방향”을 저장한다.
 * 목표는 이웃으로 만들 때 확인하므로 목표 칸은 확장(expandedCount)에 들어가지 않는다.
 */
export function runDFS(maze, options = {}) {
  const recordSteps = Boolean(options.recordSteps);
  const invalid = validateSearchInput(maze, "dfs.js::runDFS");
  if (invalid) return invalid;

  const startKey = cellKey(maze.start.row, maze.start.col);
  const visited = new Set([startKey]);
  const parent = new Map();
  const stack = [{ row: maze.start.row, col: maze.start.col, dirIndex: 0 }];
  const steps = recordSteps ? [] : null;
  let found = sameCell(maze.start, maze.end);
  const m = createCounters();
  m.discovered.add(startKey);
  if (found) m.expanded.add(startKey);
  m.queuePushes = 1;
  m.openCount = 1;
  m.peakFrontier = 1;

  if (recordSteps) {
    steps.push(makeStep(stack[0], maze, stack, visited, found ? "visit" : "start", false));
  }

  let expandedCount = 0;
  let reencountered = 0;
  while (stack.length && !found) {
    const frame = stack[stack.length - 1];
    const frameKey = cellKey(frame.row, frame.col);
    if (frame.dirIndex === 0) {
      m.expanded.add(frameKey);
      expandedCount += 1;
    }

    if (frame.dirIndex >= DIRS.length) {
      stack.pop();
      m.queuePops += 1;
      m.openCount = Math.max(0, m.openCount - 1);
      if (recordSteps && stack.length) {
        steps.push(makeStep(stack[stack.length - 1], maze, stack, visited, "backtrack", true));
      }
      continue;
    }

    const dir = DIRS[frame.dirIndex];
    frame.dirIndex += 1;
    const nr = frame.row + dir.dr;
    const nc = frame.col + dir.dc;
    if (!isWalkable(maze, nr, nc)) continue;
    m.generatedNodes += 1;
    const nextKey = cellKey(nr, nc);
    if (visited.has(nextKey)) {
      reencountered += 1;
      continue;
    }

    visited.add(nextKey);
    m.discovered.add(nextKey);
    parent.set(nextKey, cellKey(frame.row, frame.col));
    const next = { row: nr, col: nc, dirIndex: 0 };
    stack.push(next);
    m.queuePushes += 1;
    m.openCount += 1;
    m.peakFrontier = Math.max(m.peakFrontier, stack.length);
    if (recordSteps) {
      steps.push(makeStep(next, maze, stack, visited, "visit", false));
    }
    if (sameCell(next, maze.end)) {
      found = true;
      break;
    }
  }

  const snap = snapshotCounters(m);
  return finishResult(maze, m.expanded, parent, found, steps, {
    searchMode: "dfs",
    solver: "dfs.js::runDFS",
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

function makeStep(current, maze, stack, visited, event, backtrack) {
  const seen = new Set();
  const frontier = [];
  for (const cell of remainingFrontier(maze, stack, visited)) {
    const key = cellKey(cell.row, cell.col);
    if (seen.has(key) || (cell.row === current.row && cell.col === current.col)) continue;
    seen.add(key);
    frontier.push({ row: cell.row, col: cell.col });
  }

  return {
    current: { row: current.row, col: current.col },
    visitedAdd: backtrack ? null : { row: current.row, col: current.col },
    frontier,
    event,
    reason: dfsReason(current, maze, backtrack),
    detail: dfsDetail(current, maze, frontier.length, visited.size, backtrack),
  };
}

function remainingFrontier(maze, stack, visited) {
  const extra = [];
  for (const frame of stack) {
    for (let i = frame.dirIndex; i < DIRS.length; i += 1) {
      const nr = frame.row + DIRS[i].dr;
      const nc = frame.col + DIRS[i].dc;
      if (!inBounds(maze, nr, nc) || !isWalkable(maze, nr, nc)) continue;
      const key = cellKey(nr, nc);
      if (!visited.has(key)) extra.push({ row: nr, col: nc });
    }
  }
  return extra;
}

function dfsReason(current, maze, backtrack) {
  if (sameCell(current, maze.start) && !backtrack) {
    return "시작점에서 탐색을 시작합니다. DFS는 갈 수 있는 방향 하나를 골라 깊게 들어갑니다.";
  }
  if (sameCell(current, maze.end)) {
    return "목표 칸에 도착했습니다. 지금까지 따라온 길을 경로로 저장합니다.";
  }
  if (backtrack) {
    return "더 이상 갈 곳이 없어 이전 갈림길로 돌아갑니다. 이것을 백트래킹이라고 합니다.";
  }
  return "현재 위치에서 갈 수 있는 방향 중 하나를 선택해 최대한 깊게 들어갑니다.";
}

function dfsDetail(current, maze, frontierCount, visitedCount, backtrack) {
  if (backtrack) {
    return `(${current.row}, ${current.col})로 되돌아왔습니다. DFS는 스택에 남겨 둔 갈림길을 나중에 다시 살펴봅니다. 지금 후보 칸은 ${frontierCount}개입니다.`;
  }
  return `(${current.row}, ${current.col}) 칸을 방문했습니다. 아직 가보지 않은 이웃은 나중에 보기 위해 남겨 두고, 지금은 한 방향만 이어서 갑니다. 지금까지 방문한 칸은 ${visitedCount}개입니다.`;
}
