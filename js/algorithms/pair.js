import { finishResult, hiresNow, validateSearchInput } from "./common.js";

const D4 = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * 최단 비용을 보장하는 탐색.
 * 칸 비용이 모두 1이면 양방향 BFS다. 시작과 목표에서 거리 순서로 퍼지고,
 * 두 영역이 처음으로 맞닿은 길이 가장 짧다.
 * 칸 비용이 1보다 큰 곳이 있으면 A*다. f = g + 맨해튼이고,
 * 한 걸음의 비용이 1 이상이면 이 예상은 과대평가가 아니라서 처음 확정한 목표가 최단 비용이다.
 * 양방향 BFS와 A*는 이미 있는 방법이다. 여기서는 그 규칙을 배열 한 칸씩만 움직여 실행한다.
 */
export function runPAIR(maze, options = {}) {
  const invalid = validateSearchInput(maze, "pair.js::runPAIR");
  if (invalid) return invalid;
  if (hasUnevenWeight(maze)) return runWeightedAStar(maze, options);
  return runMeet(maze, options);
}

function hasUnevenWeight(maze) {
  const wall = maze.cells;
  const weight = maze.weights;
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      if (wall[r][c] !== 1 && (weight[r][c] || 1) !== 1) return true;
    }
  }
  return false;
}

function runMeet(maze, options) {
  const recordSteps = Boolean(options.recordSteps);
  const rows = maze.rows;
  const cols = maze.cols;
  const n = rows * cols;
  const wall = maze.cells;
  const start = maze.start.row * cols + maze.start.col;
  const goal = maze.end.row * cols + maze.end.col;
  if (start === goal) {
    return finishResult(maze, { size: 1 }, new Map(), true, recordSteps ? [] : null, {
      searchMode: "unit-bidirectional",
      solver: "pair.js::runMeet",
      skipPath: options.skipPath,
      v2: { discoveredCount: 1, expandedCount: 0, generatedCount: 0, reencounteredCount: 0, expansionUnit: "cells" },
    });
  }

  const side = new Uint8Array(n);
  const dist = new Int32Array(n);
  const parent = new Int32Array(n);
  parent.fill(-1);
  const qS = new Int32Array(n);
  const qG = new Int32Array(n);
  let hs = 0;
  let ts = 0;
  let hg = 0;
  let tg = 0;
  side[start] = 1;
  side[goal] = 2;
  qS[ts++] = start;
  qG[tg++] = goal;
  let queuePushes = 2;
  let queuePops = 0;
  let discovered = 2;
  let generatedNodes = 0;

  const steps = recordSteps ? [] : null;
  let expanded = 0;
  let reencountered = 0;
  let peakFrontier = 2;
  let meetS = -1;
  let meetG = -1;

  while (hs < ts && hg < tg && meetS < 0) {
    peakFrontier = Math.max(peakFrontier, (ts - hs) + (tg - hg));
    const fromStart = dist[qS[hs]] <= dist[qG[hg]];
    const cur = fromStart ? qS[hs++] : qG[hg++];
    queuePops += 1;
    const curSide = fromStart ? 1 : 2;
    expanded += 1;
    if (recordSteps) steps.push(stepOf(cur, cols, maze, curSide, dist[cur], "visit"));

    const r = (cur / cols) | 0;
    const c = cur - r * cols;
    for (let d = 0; d < 4; d += 1) {
      const rr = r + D4[d][0];
      const cc = c + D4[d][1];
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols || wall[rr][cc] === 1) continue;
      generatedNodes += 1;
      const nid = rr * cols + cc;
      const other = side[nid];
      if (other !== 0) reencountered += 1;
      if (other !== 0 && other !== curSide) {
        if (curSide === 1) {
          meetS = cur;
          meetG = nid;
        } else {
          meetS = nid;
          meetG = cur;
        }
        break;
      }
      if (other === 0) {
        side[nid] = curSide;
        dist[nid] = dist[cur] + 1;
        parent[nid] = cur;
        discovered += 1;
        if (curSide === 1) qS[ts++] = nid;
        else qG[tg++] = nid;
        queuePushes += 1;
      }
    }
  }

  const parentMap = new Map();
  let found = false;
  const tPath = hiresNow();
  if (meetS >= 0 && options.skipPath) {
    found = true;
  } else if (meetS >= 0) {
    const forward = [];
    let cur = meetS;
    let safe = n + 2;
    while (cur !== -1 && safe-- > 0) {
      forward.push(cur);
      if (cur === start) break;
      cur = parent[cur];
    }
    forward.reverse();
    const backward = [];
    cur = meetG;
    safe = n + 2;
    while (cur !== -1 && safe-- > 0) {
      backward.push(cur);
      if (cur === goal) break;
      cur = parent[cur];
    }
    const chain = forward.concat(backward);
    if (chain[0] === start && chain[chain.length - 1] === goal) {
      found = true;
      for (let i = 1; i < chain.length; i += 1) {
        parentMap.set(keyOf(chain[i], cols), keyOf(chain[i - 1], cols));
      }
    }
  }
  const pathPrepMs = hiresNow() - tPath;

  return finishResult(maze, { size: expanded }, parentMap, found, steps, {
    pathPrepMs,
    searchMode: "unit-bidirectional",
    solver: "pair.js::runMeet",
    discoveredCells: discovered,
    discoveredNodes: discovered,
    expandedNodes: expanded,
    generatedNodes,
    peakFrontier,
    queuePushes,
    queuePops,
    queueOps: queuePushes + queuePops,
    skipPath: options.skipPath,
    visitedUnit: "cells",
    pathLengthSource: "reconstructed-cells",
    v2: {
      discoveredCount: discovered,
      expandedCount: expanded,
      generatedCount: generatedNodes,
      reencounteredCount: reencountered,
      expansionUnit: "cells",
    },
  });
}

function runWeightedAStar(maze, options) {
  const recordSteps = Boolean(options.recordSteps);
  const rows = maze.rows;
  const cols = maze.cols;
  const n = rows * cols;
  const wall = maze.cells;
  const weight = maze.weights;
  const start = maze.start.row * cols + maze.start.col;
  const goal = maze.end.row * cols + maze.end.col;
  const goalR = (goal / cols) | 0;
  const goalC = goal - goalR * cols;
  if (start === goal) {
    return finishResult(maze, { size: 1 }, new Map(), true, recordSteps ? [] : null, {
      searchMode: "weighted-A*",
      solver: "pair.js::runWeightedAStar",
      skipPath: options.skipPath,
      v2: { discoveredCount: 1, expandedCount: 0, generatedCount: 0, reencounteredCount: 0, expansionUnit: "cells" },
    });
  }

  // Float64: 소수 칸 비용을 정수로 자르지 않는다.
  const gScore = new Float64Array(n);
  gScore.fill(Infinity);
  gScore[start] = 0;
  const parent = new Int32Array(n);
  parent.fill(-1);
  const closed = new Uint8Array(n);
  const heapI = [];
  const heapG = [];
  const heur = { n: 0 };
  pushHeap(heapI, heapG, gScore, cols, goalR, goalC, start, 0, heur);

  const steps = recordSteps ? [] : null;
  let expanded = 0;
  let expandedCount = 0;
  let reencountered = 0;
  let improved = 0;
  let discovered = 1;
  let generatedNodes = 0;
  let found = false;
  let heapPushes = 1;
  let heapPops = 0;
  let openCount = 1;
  let peakFrontier = 1;

  while (heapI.length) {
    const popped = popRoot(heapI, heapG, cols, goalR, goalC, heur);
    heapPops += 1;
    const id = popped.id;
    const gPush = popped.g;
    if (closed[id] || gPush !== gScore[id]) continue;
    closed[id] = 1;
    expanded += 1;
    openCount = Math.max(0, openCount - 1);
    peakFrontier = Math.max(peakFrontier, openCount);
    const h = man(id, cols, goalR, goalC, heur);
    if (recordSteps) {
      steps.push({
        ...stepOf(id, cols, maze, 1, gScore[id], id === start ? "start" : "visit"),
        scores: { g: gScore[id], h, f: gScore[id] + h },
        reason: "지금까지의 비용 g와 목표까지 맨해튼 거리 h를 더한 값이 가장 작은 칸을 확정합니다.",
      });
    }
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
      const seen = gScore[nid] !== Infinity;
      if (seen) reencountered += 1;
      if (closed[nid]) continue;
      const ng = gScore[id] + (weight[rr][cc] || 1);
      if (ng >= gScore[nid]) continue;
      if (!seen) {
        discovered += 1;
        openCount += 1;
      } else {
        improved += 1;
      }
      gScore[nid] = ng;
      parent[nid] = id;
      pushHeap(heapI, heapG, gScore, cols, goalR, goalC, nid, ng, heur);
      heapPushes += 1;
      peakFrontier = Math.max(peakFrontier, openCount);
    }
  }

  const parentMap = new Map();
  const tPath = hiresNow();
  if (found && !options.skipPath) {
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
    searchMode: "weighted-A*",
    solver: "pair.js::runWeightedAStar",
    heuristicEvals: heur.n,
    heapPushes,
    heapPops,
    queueOps: null,
    discoveredCells: discovered,
    discoveredNodes: discovered,
    expandedNodes: expanded,
    generatedNodes,
    peakFrontier,
    visitedUnit: "cells",
    pathLengthSource: "reconstructed-cells",
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

function pushHeap(heapI, heapG, gScore, cols, goalR, goalC, id, g, heur) {
  heapI.push(id);
  heapG.push(g);
  let i = heapI.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (better(heapI[p], heapG[p], heapI[i], heapG[i], cols, goalR, goalC, heur)) break;
    swap(heapI, heapG, i, p);
    i = p;
  }
}

function popRoot(heapI, heapG, cols, goalR, goalC, heur) {
  const id = heapI[0];
  const g = heapG[0];
  const lastId = heapI.pop();
  const lastG = heapG.pop();
  if (heapI.length) {
    heapI[0] = lastId;
    heapG[0] = lastG;
    let i = 0;
    const n = heapI.length;
    while (true) {
      let best = i;
      const left = i * 2 + 1;
      const right = left + 1;
      if (left < n && better(heapI[left], heapG[left], heapI[best], heapG[best], cols, goalR, goalC, heur)) best = left;
      if (right < n && better(heapI[right], heapG[right], heapI[best], heapG[best], cols, goalR, goalC, heur)) best = right;
      if (best === i) break;
      swap(heapI, heapG, i, best);
      i = best;
    }
  }
  return { id, g };
}

function better(idA, gA, idB, gB, cols, goalR, goalC, heur) {
  const fA = gA + man(idA, cols, goalR, goalC, heur);
  const fB = gB + man(idB, cols, goalR, goalC, heur);
  if (fA !== fB) return fA < fB;
  return gA <= gB;
}

function swap(heapI, heapG, i, j) {
  const id = heapI[i];
  heapI[i] = heapI[j];
  heapI[j] = id;
  const g = heapG[i];
  heapG[i] = heapG[j];
  heapG[j] = g;
}

function man(id, cols, goalR, goalC, heur) {
  if (heur) heur.n += 1;
  const r = (id / cols) | 0;
  return Math.abs(r - goalR) + Math.abs((id - r * cols) - goalC);
}

function keyOf(id, cols) {
  const r = (id / cols) | 0;
  return `${r},${id - r * cols}`;
}

function stepOf(id, cols, maze, side, distance, event) {
  const r = (id / cols) | 0;
  const c = id - r * cols;
  const fromStart = side === 1;
  return {
    current: { row: r, col: c },
    visitedAdd: { row: r, col: c },
    frontier: [],
    event,
    reason: fromStart
      ? `시작 쪽에서 거리 ${distance}인 칸을 확장합니다. 같은 거리의 칸을 먼저 보고, 목표 쪽에서 온 칸을 만나면 그 길의 길이가 최단입니다.`
      : `목표 쪽에서 거리 ${distance}인 칸을 확장합니다. 시작 쪽과 맞닿으면 두 거리를 더한 길이 가장 짧습니다.`,
    detail: "칸마다 비용이 1이면 먼저 만나는 연결이 최단 경로입니다. 비용이 다른 미로에서는 이 양방향 규칙 대신 A*가 최단 비용을 확정합니다.",
  };
}
