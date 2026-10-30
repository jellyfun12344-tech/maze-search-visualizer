import { finishResult, hiresNow, validateSearchInput } from "./common.js";

const D4 = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * RIM — Rim Index March
 *
 * 탐색한 구역의 경계(아직 안 가 본 이웃)를 한 줄로 둔다.
 * 다음에 고를 칸은 거리가 가장 짧은 칸도, 복도를 접은 갈림길도 아니다.
 * 방금 넣은 칸에 붙은 벽의 수만큼 그 줄에서 건너뛴다.
 */
export function runRIM(maze, options = {}) {
  const recordSteps = Boolean(options.recordSteps);
  const invalid = validateSearchInput(maze, "rim.js::runRIM");
  if (invalid) return invalid;

  const rows = maze.rows;
  const cols = maze.cols;
  const n = rows * cols;
  const wall = maze.cells;
  const start = maze.start.row * cols + maze.start.col;
  const goal = maze.end.row * cols + maze.end.col;
  const explored = new Uint8Array(n);
  const inFrontier = new Uint8Array(n);
  const parent = new Int32Array(n);
  parent.fill(-1);
  const frontier = [];
  const steps = recordSteps ? [] : null;

  explored[start] = 1;
  let generatedNodes = 0;
  let queuePushes = 0;
  let queuePops = 0;
  let peakFrontier = 0;
  let discovered = 1;
  let expandedCount = 0;
  let reencountered = 0;
  let found = start === goal;
  if (!found) pushOpenNeighbors(start);
  peakFrontier = Math.max(peakFrontier, frontier.length);
  let cursor = 0;
  let last = start;
  let expanded = 1;

  if (recordSteps) {
    steps.push(makeStep(start, cols, maze, frontier, 0, "시작 칸을 탐색 구역에 넣었습니다. 경계에 나온 칸을 벽 개수만큼 건너뛰며 고릅니다."));
  }

  let guard = n + 2;
  while (!found && frontier.length && guard-- > 0) {
    const walls = countWalls(last, rows, cols, wall);
    const stride = 1 + walls;
    cursor = (cursor + stride) % frontier.length;
    const id = frontier[cursor];
    frontier.splice(cursor, 1);
    queuePops += 1;
    inFrontier[id] = 0;
    if (cursor >= frontier.length) cursor = 0;

    explored[id] = 1;
    parent[id] = exploredNeighbor(id, rows, cols, wall, explored);
    expanded += 1;
    last = id;
    if (recordSteps) {
      steps.push(makeStep(
        id,
        cols,
        maze,
        frontier,
        walls,
        `이 칸을 고른 이유는 방금 칸에 벽이 ${walls}개 붙어 있어서, 경계 줄에서 ${stride}칸 건너뛴 자리이기 때문입니다.`,
      ));
    }
    if (id === goal) {
      found = true;
      break;
    }
    pushOpenNeighbors(id);
    peakFrontier = Math.max(peakFrontier, frontier.length);
  }

  const parentMap = new Map();
  const tPath = hiresNow();
  if (found && start !== goal && !options.skipPath) {
    let cur = goal;
    let safe = n + 2;
    while (cur !== start && parent[cur] !== -1 && safe-- > 0) {
      const prev = parent[cur];
      parentMap.set(keyOf(cur, cols), keyOf(prev, cols));
      cur = prev;
    }
    if (cur !== start) found = false;
  }
  const pathPrepMs = hiresNow() - tPath;

  return finishResult(maze, { size: expanded }, parentMap, found, steps, {
    pathPrepMs,
    decision: "rim-stride",
    searchMode: "rim",
    solver: "rim.js::runRIM",
    discoveredNodes: discovered,
    expandedNodes: expanded,
    generatedNodes,
    queuePushes,
    queuePops,
    peakFrontier,
    queueOps: queuePushes + queuePops,
    skipPath: options.skipPath,
    v2: {
      discoveredCount: discovered,
      expandedCount,
      generatedCount: generatedNodes,
      reencounteredCount: reencountered,
      expansionUnit: "cells",
    },
  });

  function pushOpenNeighbors(id) {
    expandedCount += 1;
    const r = (id / cols) | 0;
    const c = id - r * cols;
    for (let d = 0; d < 4; d += 1) {
      const rr = r + D4[d][0];
      const cc = c + D4[d][1];
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols || wall[rr][cc] === 1) continue;
      const nid = rr * cols + cc;
      generatedNodes += 1;
      if (explored[nid] || inFrontier[nid]) {
        reencountered += 1;
        continue;
      }
      inFrontier[nid] = 1;
      discovered += 1;
      frontier.push(nid);
      queuePushes += 1;
    }
  }
}

function countWalls(id, rows, cols, wall) {
  const r = (id / cols) | 0;
  const c = id - r * cols;
  let walls = 0;
  for (let d = 0; d < 4; d += 1) {
    const rr = r + D4[d][0];
    const cc = c + D4[d][1];
    if (rr < 0 || cc < 0 || rr >= rows || cc >= cols || wall[rr][cc] === 1) walls += 1;
  }
  return walls;
}

function exploredNeighbor(id, rows, cols, wall, explored) {
  const r = (id / cols) | 0;
  const c = id - r * cols;
  for (let d = 0; d < 4; d += 1) {
    const rr = r + D4[d][0];
    const cc = c + D4[d][1];
    if (rr < 0 || cc < 0 || rr >= rows || cc >= cols || wall[rr][cc] === 1) continue;
    const nid = rr * cols + cc;
    if (explored[nid]) return nid;
  }
  return -1;
}

function keyOf(id, cols) {
  const r = (id / cols) | 0;
  return `${r},${id - r * cols}`;
}

function makeStep(id, cols, maze, frontier, walls, reason) {
  const r = (id / cols) | 0;
  const c = id - r * cols;
  return {
    current: { row: r, col: c },
    visitedAdd: { row: r, col: c },
    frontier: frontier.slice(0, 40).map((fid) => {
      const fr = (fid / cols) | 0;
      return { row: fr, col: fid - fr * cols };
    }),
    event: id === maze.start.row * cols + maze.start.col ? "start" : "visit",
    reason,
    detail: `경계에 대기 중인 칸은 ${frontier.length}개입니다. 벽 ${walls}개면 보폭은 ${1 + walls}입니다. 이 순서는 최단 경로를 보장하지 않습니다.`,
  };
}
