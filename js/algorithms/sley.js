import { finishResult, unsupportedCostResult, validateSearchInput } from "./common.js";

const D4 = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * SLEY — Shuttle-on-rods Lattice Exploration
 *
 * 미로는 열 막대에 꽂힌 구슬로 둔다. 북은 그 막대 안에서 다음 칸을 고른다.
 * 다만 집을 수 있는 구슬은 지금 확정할 수 있는 가장 작은 비용 층의 것만이다.
 * 비용이 더 큰 층의 구슬은 그 층이 될 때까지 막대에 남겨 둔다.
 * 음수 비용이 없으면, 목표를 처음 집는 순간의 비용이 최단이다.
 */
export function runSLEY(maze, options = {}) {
  const recordSteps = Boolean(options.recordSteps);
  const invalid = validateSearchInput(maze, "sley.js::runSLEY");
  if (invalid) return invalid;
  const bad = nonLayerWeight(maze);
  if (bad) return unsupportedCostResult("sley.js::runSLEY", bad);

  const rows = maze.rows;
  const cols = maze.cols;
  const n = rows * cols;
  const wall = maze.cells;
  const weight = maze.weights;
  const start = maze.start.row * cols + maze.start.col;
  const goal = maze.end.row * cols + maze.end.col;
  const maxW = maxWeight(maze);
  const maxCost = n * maxW + 1;

  const settled = new Uint8Array(n);
  const dist = new Int32Array(n);
  const parent = new Int32Array(n);
  dist.fill(-1);
  parent.fill(-1);

  const layers = [];
  const visited = new Set();
  const parentMap = new Map();
  const steps = recordSteps ? [] : null;
  let peakFrontier = 0;

  function layerOf(cost) {
    if (!layers[cost]) layers[cost] = Array.from({ length: cols }, () => []);
    return layers[cost];
  }

  function layerSize(cost) {
    const layer = layers[cost];
    if (!layer) return 0;
    let size = 0;
    for (let rod = 0; rod < cols; rod += 1) size += layer[rod].length;
    return size;
  }

  let pending = 0;
  function hang(id, cost) {
    layerOf(cost)[id % cols].push(id);
    pending += 1;
  }

  function pick(cost, shuttleRod, shuttleDent) {
    const layer = layers[cost];
    if (!layer) return null;
    let rod = ((shuttleRod % cols) + cols) % cols;
    for (let tryRod = 0; tryRod < cols; tryRod += 1) {
      const beads = layer[rod];
      if (beads.length) {
        const skip = beads.length === 1 ? 0 : ((shuttleDent % beads.length) + beads.length) % beads.length;
        const id = beads[skip];
        beads.splice(skip, 1);
        pending -= 1;
        return { id, rod, skipUsed: skip };
      }
      rod = (rod + 1) % cols;
    }
    return null;
  }

  function liveCells(cost, limit) {
    const out = [];
    const layer = layers[cost];
    if (!layer) return out;
    for (let rod = 0; rod < cols && out.length < limit; rod += 1) {
      for (const id of layer[rod]) {
        if (settled[id] || dist[id] !== cost) continue;
        out.push({ row: (id / cols) | 0, col: id % cols });
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  dist[start] = 0;
  hang(start, 0);
  let discovered = 1;
  let expanded = 0;
  let generatedNodes = 0;
  let queuePushes = 1;
  let queuePops = 0;
  let shuttleRod = start % cols;
  let shuttleDent = 0;
  let cost = 0;
  let found = false;
  let expandedCount = 0;
  let reencountered = 0;
  let improved = 0;
  // 구슬을 거는 횟수는 1 + 4n을 넘지 않는다. 한 번에 하나씩 집으므로 이 횟수면 반드시 끝난다.
  let guard = 4 * n + 8;

  while (guard-- > 0) {
    if (pending === 0) break;
    while (cost < maxCost && layerSize(cost) === 0) cost += 1;
    if (cost >= maxCost) break;

    const chosen = pick(cost, shuttleRod, shuttleDent);
    if (!chosen) continue;
    queuePops += 1;

    const id = chosen.id;
    if (settled[id] || dist[id] !== cost) continue;

    const row = (id / cols) | 0;
    const col = id % cols;
    settled[id] = 1;
    expanded += 1;
    expandedCount += 1;
    visited.add(`${row},${col}`);

    let openN = 0;
    let wallN = 0;
    for (const [dr, dc] of D4) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || wall[nr][nc]) {
        wallN += 1;
        continue;
      }
      openN += 1;
      generatedNodes += 1;
      const nid = nr * cols + nc;
      if (dist[nid] !== -1) reencountered += 1;
      if (settled[nid]) continue;
      const nextCost = cost + (weight[nr][nc] || 1);
      if (dist[nid] !== -1 && nextCost >= dist[nid]) continue;
      if (dist[nid] === -1) discovered += 1;
      else improved += 1;
      dist[nid] = nextCost;
      parent[nid] = id;
      parentMap.set(`${nr},${nc}`, `${row},${col}`);
      hang(nid, nextCost);
      queuePushes += 1;
    }

    peakFrontier = Math.max(peakFrontier, layerSize(cost) + 1);

    if (recordSteps) {
      steps.push({
        current: { row, col },
        visitedAdd: { row, col },
        frontier: liveCells(cost, 40),
        scores: { g: cost, h: null, f: cost },
        event: id === start ? "start" : "visit",
        reason: sleyReason(id, start, goal, chosen.rod, cost, openN, wallN),
        detail: sleyDetail(row, col, chosen.rod, chosen.skipUsed, cost, openN, wallN, cols),
      });
    }

    if (id === goal) {
      found = true;
      break;
    }

    shuttleRod = (col + openN) % cols;
    shuttleDent = row + wallN + 1;
  }

  return finishResult(maze, visited, parentMap, found, steps, {
    searchMode: "sley-rods-layer",
    solver: "sley.js::runSLEY",
    discoveredNodes: discovered,
    expandedNodes: expanded,
    generatedNodes,
    queuePushes,
    queuePops,
    queueOps: queuePushes + queuePops,
    peakFrontier,
    skipPath: options.skipPath,
    v2: {
      discoveredCount: discovered,
      expandedCount,
      generatedCount: generatedNodes,
      reencounteredCount: reencountered,
      improvedCount: improved,
      expansionUnit: "cells",
    },
  });
}

/** 비용 층은 정수 번호를 쓴다. 음수·소수 비용은 층 번호가 될 수 없다. */
function nonLayerWeight(maze) {
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      if (maze.cells[r][c] === 1) continue;
      const w = maze.weights[r][c] || 1;
      if (!Number.isInteger(w) || w < 1) return `weight ${w} at (${r},${c}) is not a positive integer`;
    }
  }
  return null;
}

function maxWeight(maze) {
  let best = 1;
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      if (maze.cells[r][c]) continue;
      const value = maze.weights[r][c] || 1;
      if (value > best) best = value;
    }
  }
  return best;
}

function sleyReason(id, start, goal, rod, cost, openN, wallN) {
  if (id === start) {
    return "시작 칸의 비용은 0입니다. 북은 지금 층(비용 0)의 막대에 있는 구슬만 집습니다.";
  }
  if (id === goal) {
    return `비용 ${cost}인 층의 구슬을 모두 보기 전에 더 싼 층은 이미 비었습니다. 지금 집은 목표의 비용이 최단입니다.`;
  }
  return `지금 층은 비용 ${cost}입니다. 북이 ${rod}번 막대에서 이 층 구슬을 집었습니다. 더 싼 층의 구슬은 남아 있지 않습니다. 다음 막대는 열린 이웃 ${openN}칸, 보폭은 벽 ${wallN}개로 정합니다.`;
}

function sleyDetail(row, col, rod, skipUsed, cost, openN, wallN, cols) {
  return `(${row}, ${col})은 비용 ${cost} 층에서 ${rod}번 막대를 ${skipUsed}칸 건너뛰어 집었습니다. 이 칸을 확정한 뒤에야 이웃을 더 비싼 층 막대에 걸어둡니다. 다음 북은 열 ${(col + openN) % cols}, 보폭 ${row + wallN + 1}입니다.`;
}
