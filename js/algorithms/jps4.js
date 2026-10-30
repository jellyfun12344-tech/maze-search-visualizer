import { cellKey, getWeight, manhattan, sameCell } from "../maze.js";
import { finishResult, hiresNow, MinHeap, validateSearchInput } from "./common.js";
import { runAStar } from "./astar.js";

/**
 * JPS4 — 4방향 Jump Point Search
 *
 * 8방향 JPS를 위·아래·왼쪽·오른쪽만 쓰도록 줄인 것이다.
 * 비용이 모두 1인 격자에서 A*와 같은 최단 거리를 보장한다.
 * 이웃 칸을 모두 넣지 않고, 대칭인 복도를 건너뛰어 점프 지점만 연다.
 * 빈 칸 비용이 1이 아니면 점프 규칙이 깨지므로 A*로 바꾼다.
 */
export function runJPS4(maze, options = {}) {
  const invalid = validateSearchInput(maze, "jps4.js::runJPS4");
  if (invalid) return invalid;
  if (hasUnevenWeight(maze)) {
    const result = runAStar(maze, options);
    return {
      ...result,
      searchMode: "weighted-A*",
      solver: "jps4.js::runAStarFallback",
      pathLengthSource: "reconstructed-cells",
    };
  }
  return runJPS4Unit(maze, options);
}

function hasUnevenWeight(maze) {
  if (!maze?.cells) return false;
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      if (maze.cells[r][c] !== 1 && getWeight(maze, r, c) !== 1) return true;
    }
  }
  return false;
}

function runJPS4Unit(maze, options) {
  const recordSteps = Boolean(options.recordSteps);
  const rows = maze.rows;
  const cols = maze.cols;
  const wall = maze.cells;
  const start = maze.start;
  const goal = maze.end;
  if (sameCell(start, goal)) {
    return finishResult(maze, { size: 1 }, new Map(), true, recordSteps ? [] : null, {
      searchMode: "jps4",
      solver: "jps4.js::runJPS4Unit",
      skipPath: options.skipPath,
      v2: { discoveredCount: 1, expandedCount: 0, generatedCount: 0, reencounteredCount: 0, expansionUnit: "jump-points", generatedUnit: "jump-attempts", scannedCells: 0 },
    });
  }

  const walkable = (r, c) =>
    r >= 0 && c >= 0 && r < rows && c < cols && wall[r][c] !== 1;

  let scannedCells = 0;
  const jump = (r, c, pr, pc) => {
    const dr = r - pr;
    const dc = c - pc;
    while (true) {
      if (!walkable(r, c)) return null;
      scannedCells += 1;
      if (r === goal.row && c === goal.col) return { row: r, col: c };
      if (dc !== 0) {
        if ((walkable(r - 1, c) && !walkable(r - 1, c - dc))
          || (walkable(r + 1, c) && !walkable(r + 1, c - dc))) {
          return { row: r, col: c };
        }
      } else if (dr !== 0) {
        if ((walkable(r, c - 1) && !walkable(r - dr, c - 1))
          || (walkable(r, c + 1) && !walkable(r - dr, c + 1))) {
          return { row: r, col: c };
        }
        if (jump(r, c + 1, r, c) || jump(r, c - 1, r, c)) {
          return { row: r, col: c };
        }
      } else {
        return null;
      }
      pr = r;
      pc = c;
      r += dr;
      c += dc;
    }
  };

  const neighborCells = (r, c, parent) => {
    if (!parent) {
      const list = [];
      if (walkable(r - 1, c)) list.push({ row: r - 1, col: c });
      if (walkable(r + 1, c)) list.push({ row: r + 1, col: c });
      if (walkable(r, c - 1)) list.push({ row: r, col: c - 1 });
      if (walkable(r, c + 1)) list.push({ row: r, col: c + 1 });
      return list;
    }
    const dr = Math.sign(r - parent.row);
    const dc = Math.sign(c - parent.col);
    const list = [];
    if (dc !== 0) {
      if (walkable(r - 1, c)) list.push({ row: r - 1, col: c });
      if (walkable(r + 1, c)) list.push({ row: r + 1, col: c });
      if (walkable(r, c + dc)) list.push({ row: r, col: c + dc });
    } else if (dr !== 0) {
      if (walkable(r, c - 1)) list.push({ row: r, col: c - 1 });
      if (walkable(r, c + 1)) list.push({ row: r, col: c + 1 });
      if (walkable(r + dr, c)) list.push({ row: r + dr, col: c });
    }
    return list;
  };

  const stitch = (from, to, parentMap) => {
    let r = to.row;
    let c = to.col;
    const sr = Math.sign(from.row - to.row);
    const sc = Math.sign(from.col - to.col);
    while (r !== from.row || c !== from.col) {
      const pr = r + sr;
      const pc = c + sc;
      parentMap.set(cellKey(r, c), cellKey(pr, pc));
      r = pr;
      c = pc;
    }
  };

  const expandJumpParents = (parents, from, to) => {
    const parentMap = new Map();
    const chain = [];
    let cur = { row: to.row, col: to.col };
    const seen = new Set();
    while (cur && !seen.has(cellKey(cur.row, cur.col))) {
      seen.add(cellKey(cur.row, cur.col));
      chain.push(cur);
      if (cur.row === from.row && cur.col === from.col) break;
      cur = parents.get(cellKey(cur.row, cur.col)) || null;
    }
    chain.reverse();
    for (let i = 1; i < chain.length; i += 1) {
      stitch(chain[i - 1], chain[i], parentMap);
    }
    return parentMap;
  };

  let heuristicEvals = 0;
  const hOf = (cell) => {
    heuristicEvals += 1;
    return manhattan(cell, goal);
  };

  const startKey = cellKey(start.row, start.col);
  const gScore = new Map([[startKey, 0]]);
  const jumpParent = new Map();
  const closed = new Set();
  const startH = hOf(start);
  const heap = new MinHeap((a, b) => a.f - b.f || a.h - b.h || a.row - b.row || a.col - b.col);
  heap.push({ row: start.row, col: start.col, g: 0, h: startH, f: startH });
  let heapPushes = 1;
  let heapPops = 0;
  let found = false;
  let generatedNodes = 0;
  let expandedCount = 0;
  let reencountered = 0;
  let improved = 0;
  let peakFrontier = 1;
  const steps = recordSteps ? [] : null;

  while (!heap.isEmpty()) {
    const current = heap.pop();
    heapPops += 1;
    const key = cellKey(current.row, current.col);
    if (closed.has(key)) continue;
    if ((gScore.get(key) ?? Infinity) !== current.g) continue;
    closed.add(key);
    peakFrontier = Math.max(peakFrontier, heap.size, gScore.size - closed.size);

    if (recordSteps) {
      steps.push({
        current: { row: current.row, col: current.col },
        visitedAdd: { row: current.row, col: current.col },
        frontier: heap.data.slice(0, 40).map((n) => ({ row: n.row, col: n.col })),
        scores: { g: current.g, h: current.h, f: current.f },
        event: sameCell(current, start) ? "start" : "visit",
        reason: sameCell(current, start)
          ? "시작점입니다. 네 방향으로 점프해서 처음 만나는 점프 지점만 후보에 넣습니다."
          : sameCell(current, goal)
            ? `목표 점프 지점에 도착했습니다. g=${current.g}는 시작에서 여기까지 최단 걸음 수입니다.`
            : `점프 지점 (${current.row}, ${current.col})을 엽니다. 복도의 중간 칸은 건너뛰었습니다.`,
        detail: "JPS4는 4방향만 씁니다. 대칭인 직선 칸은 건너뛰고, 강제 이웃이나 목표가 있는 칸에서만 멈춥니다. 비용이 모두 1이면 이 점프는 최단 거리를 유지합니다.",
      });
    }

    if (sameCell(current, goal)) {
      found = true;
      break;
    }

    expandedCount += 1;
    const from = jumpParent.get(key) || null;
    for (const next of neighborCells(current.row, current.col, from)) {
      generatedNodes += 1;
      const jp = jump(next.row, next.col, current.row, current.col);
      if (!jp) continue;
      const jpKey = cellKey(jp.row, jp.col);
      const seen = gScore.has(jpKey);
      if (seen) reencountered += 1;
      if (closed.has(jpKey)) continue;
      const step = Math.abs(jp.row - current.row) + Math.abs(jp.col - current.col);
      const g = current.g + step;
      if (g >= (gScore.get(jpKey) ?? Infinity)) continue;
      if (seen) improved += 1;
      gScore.set(jpKey, g);
      jumpParent.set(jpKey, { row: current.row, col: current.col });
      const h = hOf(jp);
      heap.push({ row: jp.row, col: jp.col, g, h, f: g + h });
      heapPushes += 1;
      peakFrontier = Math.max(peakFrontier, heap.size, gScore.size - closed.size);
    }
  }

  const tPath = hiresNow();
  const parentMap = found && !options.skipPath ? expandJumpParents(jumpParent, start, goal) : new Map();
  const pathPrepMs = hiresNow() - tPath;
  return finishResult(maze, closed, parentMap, found, steps, {
    pathPrepMs,
    v2: {
      discoveredCount: gScore.size,
      expandedCount,
      generatedCount: generatedNodes,
      reencounteredCount: reencountered,
      improvedCount: improved,
      expansionUnit: "jump-points",
      generatedUnit: "jump-attempts",
      scannedCells,
    },
    searchMode: "jps4",
    solver: "jps4.js::runJPS4Unit",
    heuristicEvals,
    heapOps: heapPushes + heapPops,
    heapPushes,
    heapPops,
    queueOps: null,
    discoveredNodes: gScore.size,
    expandedNodes: closed.size,
    generatedNodes,
    peakFrontier,
    visitedUnit: "jump-points",
    pathLengthSource: "reconstructed-cells",
    skipPath: options.skipPath,
  });
}
