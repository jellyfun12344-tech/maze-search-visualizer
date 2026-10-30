/** 우선순위 큐. Dijkstra와 A*에서 가장 유망한 칸을 꺼낼 때 사용한다. */
export class MinHeap {
  constructor(compare) {
    this.data = [];
    this.compare = compare;
  }

  get size() {
    return this.data.length;
  }

  isEmpty() {
    return this.data.length === 0;
  }

  peek() {
    return this.data[0];
  }

  push(item) {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop() {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length) {
      this.data[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.data[index], this.data[parent]) >= 0) break;
      [this.data[index], this.data[parent]] = [this.data[parent], this.data[index]];
      index = parent;
    }
  }

  bubbleDown(index) {
    const n = this.data.length;
    while (true) {
      let best = index;
      const left = index * 2 + 1;
      const right = left + 1;
      if (left < n && this.compare(this.data[left], this.data[best]) < 0) best = left;
      if (right < n && this.compare(this.data[right], this.data[best]) < 0) best = right;
      if (best === index) break;
      [this.data[index], this.data[best]] = [this.data[best], this.data[index]];
      index = best;
    }
  }
}

export const IMPLEMENTATION_VERSION = "audit5-20261024";

/**
 * 탐색 지표 정의 (모든 알고리즘 공통).
 * discoveredNodes: 처음 열린(발견) 고유 칸 수. 큐/스택/힙에 처음 넣은 칸.
 * expandedNodes: 이웃 생성을 시작한 고유 칸 수. 꺼낸 뒤 successor를 보기 시작한 칸.
 * generatedNodes: 이웃 후보를 만든 횟수(이미 본 칸·벽이 아닌 walkable 이웃 시도).
 * queuePushes / queuePops: FIFO·스택 삽입/제거. peek는 세지 않음.
 * heapPushes / heapPops: 우선순위 큐 삽입/제거. queueOps에 섞지 않음.
 * peakFrontier: 실행 중 후보 집합 크기의 최댓값(고유 open이면 고유, 아니면 구조 크기).
 */
export const METRIC_DEFINITIONS = {
  discoveredNodes: "처음 발견한 고유 노드 수",
  expandedNodes: "이웃 탐색을 시작한 고유 노드 수",
  generatedNodes: "이웃 후보 생성 횟수",
  queuePushes: "큐/스택 삽입 횟수",
  queuePops: "큐/스택 제거 횟수",
  heapPushes: "우선순위 큐 삽입 횟수",
  heapPops: "우선순위 큐 제거 횟수",
  peakFrontier: "후보 집합의 실행 중 최대 크기",
};

export function createCounters() {
  return {
    discovered: new Set(),
    expanded: new Set(),
    generatedNodes: 0,
    queuePushes: 0,
    queuePops: 0,
    heapPushes: 0,
    heapPops: 0,
    peakFrontier: 0,
    expandedForward: 0,
    expandedBackward: 0,
    openCount: 0,
  };
}

export function snapshotCounters(c) {
  return {
    discoveredNodes: c.discovered.size,
    expandedNodes: c.expanded.size,
    generatedNodes: c.generatedNodes,
    queuePushes: c.queuePushes,
    queuePops: c.queuePops,
    heapPushes: c.heapPushes,
    heapPops: c.heapPops,
    peakFrontier: c.peakFrontier,
    expandedForward: c.expandedForward,
    expandedBackward: c.expandedBackward,
  };
}

/**
 * search-metrics-v2 (모든 알고리즘 공통, METRICS_CONTRACT.md에 규칙 전체가 있다)
 * success           목표에 도달했는가 (= found)
 * pathLength        반환 경로의 이동 횟수. 실패면 null
 * pathCost          들어간 칸 비용의 합(시작 칸 제외). 실패면 null
 * discoveredCount   한 번 이상 후보 집합에 넣은 고유 노드 수 (시작 포함)
 * expandedCount     이웃 생성을 실제로 한 고유 노드 수. 목표를 꺼내자마자 멈추면 목표는 넣지 않는다
 * generatedCount    확장 중 만든 이웃 후보 수 (벽·경계 밖 제외, 이미 본 칸 포함)
 * reencounteredCount generatedCount 중 이미 발견한 노드를 다시 만난 횟수
 * expansionUnit     cells | jump-points | cell-bits (단위가 다르면 같은 열에서 비교하지 않는다)
 * terminationReason goal-found | frontier-exhausted | invalid-start | invalid-goal | invalid-maze | unsupported-cost-model | not-run
 */
export const METRICS_CONTRACT = "search-metrics-v2";

function isIntCoord(v) {
  return typeof v === "number" && Number.isInteger(v);
}

function endpointIssue(maze, cell, name) {
  if (!cell || !isIntCoord(cell.row) || !isIntCoord(cell.col)) return `${name}-not-integer`;
  if (cell.row < 0 || cell.col < 0 || cell.row >= maze.rows || cell.col >= maze.cols) return `${name}-out-of-bounds`;
  if (maze.cells && maze.cells[cell.row][cell.col] === 1) return `${name}-is-wall`;
  return null;
}

/**
 * 탐색 전에 시작·목표를 검사한다. 잘못된 입력이면 실패 결과를, 정상이면 null을 돌려준다.
 * 가상 미로(cells 없음)는 벽 여부를 여기서 읽지 않는다.
 */
export function validateSearchInput(maze, solver = null) {
  if (!maze || !isIntCoord(maze.rows) || !isIntCoord(maze.cols) || maze.rows <= 0 || maze.cols <= 0
    || (!maze.virtual && !Array.isArray(maze.cells))) {
    return invalidInputResult("invalid-maze", ["invalid-maze"], solver);
  }
  const issues = [endpointIssue(maze, maze.start, "start"), endpointIssue(maze, maze.end, "goal")].filter(Boolean);
  if (!issues.length) return null;
  const reason = issues[0].startsWith("start") ? "invalid-start" : "invalid-goal";
  return invalidInputResult(reason, issues, solver);
}

function invalidInputResult(reason, issues, solver) {
  return {
    ...emptySearchResult(reason),
    solver,
    inputIssues: issues,
  };
}

export function emptySearchResult(terminationReason = "invalid-maze") {
  return {
    found: false,
    success: false,
    terminationReason,
    path: [],
    visitedCount: 0,
    pathLength: null,
    pathCost: null,
    steps: [],
    discoveredNodes: 0,
    expandedNodes: 0,
    generatedNodes: 0,
    queuePushes: 0,
    queuePops: 0,
    heapPushes: 0,
    heapPops: 0,
    peakFrontier: 0,
    metricsContract: METRICS_CONTRACT,
    discoveredCount: 0,
    expandedCount: 0,
    generatedCount: 0,
    reencounteredCount: 0,
    expansionUnit: "cells",
    pathReconstructionMs: null,
  };
}

/** 지원하지 않는 비용 모델에서 실행을 거부할 때 쓴다. 다른 알고리즘으로 몰래 바꾸지 않는다. */
export function unsupportedCostResult(solver, detail) {
  return {
    ...emptySearchResult("unsupported-cost-model"),
    measured: false,
    solver,
    searchMode: "not-run:unsupported-cost-model",
    unsupportedDetail: detail,
    warnings: [`이 알고리즘이 지원하지 않는 칸 비용이라 실행하지 않았습니다 (${detail})`],
  };
}

export function hiresNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Benchmark metric contract (search rules are unchanged):
 * queueOps: FIFO/stack enqueue/push = 1, dequeue/pop = 1, peek/index = 0.
 * heapPushes / heapPops: heap only; not mixed into queueOps.
 * heuristicEvals: increment only at the actual heuristic call site.
 * TIER queueOps is always null.
 */
export function finishResult(maze, visited, parent, found, steps, extras = {}) {
  const skipPath = Boolean(extras.skipPath);
  const rest = { ...extras };
  delete rest.skipPath;
  const v2 = rest.v2 || null;
  delete rest.v2;
  const pathPrepMs = rest.pathPrepMs || 0;
  delete rest.pathPrepMs;
  const tPath0 = found && !skipPath ? hiresNow() : 0;
  const reconstructed = found && !skipPath ? reconstructFromParent(parent, maze.start, maze.end) : [];
  const pathReconstructionMs = found && !skipPath ? pathPrepMs + (hiresNow() - tPath0) : null;
  if (found && !skipPath && !reconstructed.length) {
    found = false;
    rest.terminationReason = "path-reconstruction-failed";
  }
  const path = reconstructed;
  const hops = reconstructed.length ? reconstructed.length - 1 : 0;
  const cost = reconstructed.length ? costOf(maze, reconstructed) : 0;
  if (found && steps && !skipPath) {
    steps.push({
      current: { ...maze.end },
      visitedAdd: null,
      frontier: [],
      path: path.map((cell) => ({ ...cell })),
      event: "complete",
      reason: "목표에 도착했습니다. 부모 칸을 거꾸로 따라가 최종 경로를 만듭니다.",
      detail: `탐색한 칸은 ${visited.size}개, 경로의 이동 횟수는 ${Math.max(0, path.length - 1)}입니다. 이 값은 이번 미로에서 실제로 측정된 결과입니다.`,
    });
  }
  const expandedNodes = rest.expandedNodes ?? visited.size;
  const discoveredNodes = rest.discoveredNodes ?? rest.discoveredCells ?? visited.size;
  const pathKnown = found && !skipPath;
  return {
    ...rest,
    found,
    success: found,
    terminationReason: rest.terminationReason || (found ? "goal-found" : "frontier-exhausted"),
    path,
    parent,
    visitedCount: expandedNodes,
    pathLength: pathKnown ? hops : null,
    pathCost: pathKnown ? cost : null,
    pathReconstructed: reconstructed.length > 0,
    pathReconstructionMs,
    metricsContract: METRICS_CONTRACT,
    discoveredCount: v2?.discoveredCount ?? null,
    expandedCount: v2?.expandedCount ?? null,
    generatedCount: v2?.generatedCount ?? null,
    reencounteredCount: v2?.reencounteredCount ?? null,
    improvedCount: v2?.improvedCount ?? null,
    expansionUnit: v2?.expansionUnit ?? "cells",
    generatedUnit: v2?.generatedUnit ?? "neighbor-candidates",
    scannedCells: v2?.scannedCells ?? null,
    discoveredNodes,
    expandedNodes,
    generatedNodes: rest.generatedNodes ?? null,
    queuePushes: rest.queuePushes ?? null,
    queuePops: rest.queuePops ?? null,
    heapPushes: rest.heapPushes ?? null,
    heapPops: rest.heapPops ?? null,
    peakFrontier: rest.peakFrontier ?? null,
    implementationVersion: rest.implementationVersion || IMPLEMENTATION_VERSION,
    steps: steps || [],
  };
}

function reconstructFromParent(parent, start, end) {
  const path = [];
  let key = `${end.row},${end.col}`;
  const startKey = `${start.row},${start.col}`;
  const seen = new Set();
  while (key && !seen.has(key)) {
    seen.add(key);
    const [row, col] = key.split(",").map(Number);
    path.push({ row, col });
    if (key === startKey) break;
    key = parent.get(key);
  }
  path.reverse();
  if (!path.length || path[0].row !== start.row || path[0].col !== start.col) {
    return [];
  }
  return path;
}

function costOf(maze, path) {
  let cost = 0;
  for (let i = 1; i < path.length; i += 1) {
    cost += maze.weights[path[i].row][path[i].col] || 1;
  }
  return cost;
}

export function frontierCells(structure, pick) {
  return structure.map(pick);
}
