/**
 * 독립 검증기 (oracle).
 *
 * 이 파일은 js/algorithms/*, maze.js의 neighbors/getWeight를 가져오지 않는다.
 * 미로의 cells/weights 배열만 직접 읽어 기준 거리와 경로 유효성을 계산한다.
 *
 * 이동 규칙: 상하좌우 4방향. 대각선 이동은 프로젝트에 없으므로 기준에서도 허용하지 않는다.
 * 비용 모델: 한 걸음의 비용 = 들어가는 칸의 weights 값. 시작 칸은 더하지 않는다.
 *   프로젝트 getWeight()와 같게 0·NaN·undefined는 1로 읽는다 (`w || 1`).
 *   음수는 그대로 음수다. 음수가 있으면 Dijkstra 기준을 만들지 않는다.
 */

export const ORACLE_VERSION = "oracle-v1-20261024";
export const MOVE_RULE = "4-connected";

const DR = [-1, 1, 0, 0];
const DC = [0, 0, -1, 1];

function isInt(n) {
  return typeof n === "number" && Number.isInteger(n);
}

function rawCellIsWall(maze, r, c) {
  return maze.cells[r][c] === 1;
}

/** 프로젝트 비용 규칙을 그대로 옮긴 값. */
export function effectiveWeight(maze, r, c) {
  const w = maze.weights ? maze.weights[r]?.[c] : 1;
  return w || 1;
}

export function costModel(maze) {
  const model = {
    uniform: true,
    negative: false,
    nonInteger: false,
    belowOne: false,
    minWeight: 1,
    maxWeight: 1,
  };
  if (!maze?.cells) return model;
  let min = Infinity;
  let max = -Infinity;
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      if (rawCellIsWall(maze, r, c)) continue;
      const w = effectiveWeight(maze, r, c);
      if (w < min) min = w;
      if (w > max) max = w;
      if (w !== 1) model.uniform = false;
      if (w < 0) model.negative = true;
      if (!Number.isFinite(w) || !Number.isInteger(w)) model.nonInteger = true;
      if (w < 1) model.belowOne = true;
    }
  }
  if (min !== Infinity) {
    model.minWeight = min;
    model.maxWeight = max;
  }
  return model;
}

export function validateEndpoints(maze) {
  const issues = [];
  if (!maze || !Array.isArray(maze.cells) || !isInt(maze.rows) || !isInt(maze.cols) || maze.rows <= 0 || maze.cols <= 0) {
    return { ok: false, issues: ["invalid-maze"] };
  }
  const check = (cell, name) => {
    if (!cell || !isInt(cell.row) || !isInt(cell.col)) {
      issues.push(`${name}-not-integer`);
      return;
    }
    if (cell.row < 0 || cell.col < 0 || cell.row >= maze.rows || cell.col >= maze.cols) {
      issues.push(`${name}-out-of-bounds`);
      return;
    }
    if (rawCellIsWall(maze, cell.row, cell.col)) issues.push(`${name}-is-wall`);
  };
  check(maze.start, "start");
  check(maze.end, "goal");
  return { ok: issues.length === 0, issues };
}

/**
 * 기준 해. 단위 비용이면 BFS, 아니면 Dijkstra (이진 힙).
 * 반환: { status, reachable, distance, cost, method }
 *   status: "ok" | "invalid-input" | "unsupported-negative-cost"
 *   distance: 단위 비용일 때 최소 이동 횟수, 가중일 때는 최저 비용 경로 중 하나의 이동 횟수가 아니라 null
 *   cost: 최저 비용 (단위 비용이면 distance와 같다)
 */
export function referenceSolve(maze) {
  const ends = validateEndpoints(maze);
  if (!ends.ok) {
    return { status: "invalid-input", issues: ends.issues, reachable: false, distance: null, cost: null, method: null };
  }
  const model = costModel(maze);
  if (model.negative) {
    return { status: "unsupported-negative-cost", issues: [], reachable: null, distance: null, cost: null, method: null };
  }
  return model.uniform ? bfsReference(maze) : dijkstraReference(maze);
}

function bfsReference(maze) {
  const rows = maze.rows;
  const cols = maze.cols;
  const n = rows * cols;
  const start = maze.start.row * cols + maze.start.col;
  const goal = maze.end.row * cols + maze.end.col;
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const cur = queue[head++];
    if (cur === goal) break;
    const r = (cur / cols) | 0;
    const c = cur - r * cols;
    for (let d = 0; d < 4; d += 1) {
      const rr = r + DR[d];
      const cc = c + DC[d];
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      if (rawCellIsWall(maze, rr, cc)) continue;
      const id = rr * cols + cc;
      if (dist[id] !== -1) continue;
      dist[id] = dist[cur] + 1;
      queue[tail++] = id;
    }
  }
  const reachable = dist[goal] !== -1;
  return {
    status: "ok",
    issues: [],
    reachable,
    distance: reachable ? dist[goal] : null,
    cost: reachable ? dist[goal] : null,
    method: "bfs",
  };
}

function dijkstraReference(maze) {
  const rows = maze.rows;
  const cols = maze.cols;
  const n = rows * cols;
  const start = maze.start.row * cols + maze.start.col;
  const goal = maze.end.row * cols + maze.end.col;
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  const heapId = [];
  const heapKey = [];
  const push = (id, key) => {
    heapId.push(id);
    heapKey.push(key);
    let i = heapId.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapKey[p] <= heapKey[i]) break;
      [heapId[p], heapId[i]] = [heapId[i], heapId[p]];
      [heapKey[p], heapKey[i]] = [heapKey[i], heapKey[p]];
      i = p;
    }
  };
  const pop = () => {
    const id = heapId[0];
    const key = heapKey[0];
    const lastId = heapId.pop();
    const lastKey = heapKey.pop();
    if (heapId.length) {
      heapId[0] = lastId;
      heapKey[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const rgt = l + 1;
        let best = i;
        if (l < heapId.length && heapKey[l] < heapKey[best]) best = l;
        if (rgt < heapId.length && heapKey[rgt] < heapKey[best]) best = rgt;
        if (best === i) break;
        [heapId[best], heapId[i]] = [heapId[i], heapId[best]];
        [heapKey[best], heapKey[i]] = [heapKey[i], heapKey[best]];
        i = best;
      }
    }
    return { id, key };
  };
  dist[start] = 0;
  push(start, 0);
  while (heapId.length) {
    const { id, key } = pop();
    if (done[id] || key !== dist[id]) continue;
    done[id] = 1;
    if (id === goal) break;
    const r = (id / cols) | 0;
    const c = id - r * cols;
    for (let d = 0; d < 4; d += 1) {
      const rr = r + DR[d];
      const cc = c + DC[d];
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      if (rawCellIsWall(maze, rr, cc)) continue;
      const nid = rr * cols + cc;
      const nd = key + effectiveWeight(maze, rr, cc);
      if (nd < dist[nid]) {
        dist[nid] = nd;
        push(nid, nd);
      }
    }
  }
  const reachable = dist[goal] !== Infinity;
  return {
    status: "ok",
    issues: [],
    reachable,
    distance: null,
    cost: reachable ? dist[goal] : null,
    method: "dijkstra",
  };
}

/**
 * 반환 경로를 미로 데이터만으로 검사한다. 알고리즘이 보고한 pathLength·pathCost는
 * 비교 대상일 뿐, 이 함수가 계산에 쓰지 않는다.
 */
export function validatePath(maze, result) {
  const issues = [];
  const ends = validateEndpoints(maze);
  if (!ends.ok) issues.push(...ends.issues);
  const success = Boolean(result?.found ?? result?.success);
  const path = Array.isArray(result?.path) ? result.path : [];
  if (!success) {
    if (path.length) issues.push("path-attached-to-failure");
    return { ok: issues.length === 0, applicable: false, issues, hops: null, cost: null, revisits: 0 };
  }
  if (!path.length) {
    issues.push("empty-path");
    return { ok: false, applicable: true, issues, hops: null, cost: null, revisits: 0 };
  }
  let cost = 0;
  const seen = new Set();
  let revisits = 0;
  for (let i = 0; i < path.length; i += 1) {
    const cell = path[i];
    if (!cell || !isInt(cell.row) || !isInt(cell.col)) {
      issues.push("non-integer-cell");
      break;
    }
    if (cell.row < 0 || cell.col < 0 || cell.row >= maze.rows || cell.col >= maze.cols) {
      issues.push("out-of-bounds");
      break;
    }
    if (rawCellIsWall(maze, cell.row, cell.col)) {
      issues.push("through-wall");
      break;
    }
    const k = cell.row * maze.cols + cell.col;
    if (seen.has(k)) revisits += 1;
    seen.add(k);
    if (i === 0) continue;
    const dr = Math.abs(cell.row - path[i - 1].row);
    const dc = Math.abs(cell.col - path[i - 1].col);
    if (dr + dc === 0) issues.push("zero-move");
    else if (dr === 1 && dc === 1) issues.push("diagonal-move");
    else if (dr + dc !== 1) issues.push("not-adjacent");
    cost += effectiveWeight(maze, cell.row, cell.col);
  }
  const first = path[0];
  const last = path[path.length - 1];
  if (!first || first.row !== maze.start?.row || first.col !== maze.start?.col) issues.push("bad-start");
  if (!last || last.row !== maze.end?.row || last.col !== maze.end?.col) issues.push("bad-end");
  const hops = path.length - 1;
  if (result.pathLength != null && result.pathLength !== hops) issues.push("reported-length-mismatch");
  if (result.pathCost != null && Math.abs(result.pathCost - cost) > 1e-9) issues.push("reported-cost-mismatch");
  return { ok: issues.length === 0, applicable: true, issues: [...new Set(issues)], hops, cost, revisits };
}

/**
 * 한 실행을 판정한다.
 * guarantees는 호출한 쪽(실험 코드)이 알고리즘·설정·비용 모델로 정한 값이며,
 * 여기서는 판정에 쓰지 않고 그대로 돌려준다. 보장과 이번 확인을 섞지 않기 위해서다.
 */
export function certifyRun(maze, result, reference = referenceSolve(maze), guarantees = null) {
  const path = validatePath(maze, result);
  const success = Boolean(result?.found ?? result?.success);
  const out = {
    oracleVersion: ORACLE_VERSION,
    moveRule: MOVE_RULE,
    referenceStatus: reference.status,
    referenceMethod: reference.method,
    referenceReachable: reference.reachable,
    referenceDistance: reference.distance,
    referenceCost: reference.cost,
    success,
    pathValidityPassed: path.applicable ? path.ok : null,
    pathValidityIssues: path.issues,
    recomputedHops: path.hops,
    recomputedCost: path.cost,
    reachabilityAgrees: null,
    optimalityVerified: null,
    optimalityStatus: "not-verified",
    guaranteesOptimality: guarantees,
  };
  if (result?.measured === false) {
    out.pathValidityPassed = null;
    out.optimalityStatus = "not-run";
    return out;
  }
  if (reference.status === "invalid-input") {
    out.reachabilityAgrees = !success;
    out.optimalityStatus = success ? "success-on-invalid-input" : "invalid-input-rejected";
    out.optimalityVerified = success ? false : null;
    return out;
  }
  if (reference.status !== "ok") {
    out.optimalityStatus = reference.status;
    return out;
  }
  out.reachabilityAgrees = success === reference.reachable;
  if (!reference.reachable) {
    out.optimalityStatus = success ? "path-claimed-on-unreachable" : "unreachable-agrees";
    if (success) out.optimalityVerified = false;
    return out;
  }
  if (!success) {
    out.optimalityStatus = "missed-reachable-goal";
    out.optimalityVerified = false;
    return out;
  }
  if (!path.ok) {
    out.optimalityStatus = "invalid-path";
    out.optimalityVerified = false;
    return out;
  }
  const equal = Math.abs(path.cost - reference.cost) <= 1e-9;
  out.optimalityVerified = equal;
  out.optimalityStatus = equal ? "optimal" : "valid-not-optimal";
  return out;
}
