import { oddInterior, virtualIsWall, virtualPath } from "./virtual-maze.js";

/** 미로 칸 종류. 이동 가능한 칸은 그래프의 정점(Vertex)이다. */
export const CELL_EMPTY = 0;
export const CELL_WALL = 1;

export const DIRS = [
  { dr: -1, dc: 0, name: "위" },
  { dr: 0, dc: 1, name: "오른쪽" },
  { dr: 1, dc: 0, name: "아래" },
  { dr: 0, dc: -1, name: "왼쪽" },
];

export const MIN_MAZE_DIM = 5;
export const MAX_MAZE_DIM = 10_000_000_000;
export const MAX_GRID_CELLS = 250_000;
export const MAX_SEARCH_CELLS = 16_000;
export const MAX_ALGO_CELLS = 2_000_000;

export const SIZE_PRESETS = {
  small: { rows: 11, cols: 11 },
  medium: { rows: 21, cols: 21 },
  large: { rows: 31, cols: 31 },
  huge: { rows: 101, cols: 101 },
  vast: { rows: 251, cols: 251 },
  giga: { rows: 10_000_000_000, cols: 10_000_000_000 },
};

export function cellKey(row, col) {
  return `${row},${col}`;
}

export function parseKey(key) {
  const [row, col] = key.split(",").map(Number);
  return { row, col };
}

export function inBounds(maze, row, col) {
  return row >= 0 && col >= 0 && row < maze.rows && col < maze.cols;
}

export function isVirtualMaze(maze) {
  return Boolean(maze && maze.virtual);
}

export function exceedsCellLimit(rows, cols, limit = MAX_GRID_CELLS) {
  const r = Number(rows);
  const c = Number(cols);
  if (!Number.isFinite(r) || !Number.isFinite(c) || r <= 0 || c <= 0) return true;
  if (c > limit) return true;
  return r > Math.floor(limit / c);
}

export function formatMazeDim(n) {
  return Number(n).toLocaleString("ko-KR");
}

export function getCell(maze, row, col) {
  if (!inBounds(maze, row, col)) return CELL_WALL;
  if (isVirtualMaze(maze)) return virtualIsWall(maze, row, col) ? CELL_WALL : CELL_EMPTY;
  return maze.cells[row][col];
}

export function isWalkable(maze, row, col) {
  return inBounds(maze, row, col) && getCell(maze, row, col) !== CELL_WALL;
}

export function getWeight(maze, row, col) {
  if (!maze.weights) return 1;
  return maze.weights[row][col] || 1;
}

export function manhattan(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

export function sameCell(a, b) {
  return a && b && a.row === b.row && a.col === b.col;
}

export function neighbors(maze, row, col) {
  const list = [];
  for (const dir of DIRS) {
    const nr = row + dir.dr;
    const nc = col + dir.dc;
    if (isWalkable(maze, nr, nc)) {
      list.push({ row: nr, col: nc, dir: dir.name });
    }
  }
  return list;
}

export function createMaze(rows, cols, options = {}) {
  const cells = Array.from({ length: rows }, () => Array(cols).fill(CELL_EMPTY));
  const weights = Array.from({ length: rows }, () => Array(cols).fill(1));
  const start = options.start || { row: 1, col: 1 };
  const end = options.end || { row: rows - 2, col: cols - 2 };
  return {
    rows,
    cols,
    cells,
    weights,
    start: { ...start },
    end: { ...end },
  };
}

export function createVirtualMaze(rows, cols, options = {}) {
  const seed = options.seed != null ? options.seed | 0 : (Math.random() * 0x7fffffff) | 0;
  const maze = {
    virtual: true,
    rows,
    cols,
    seed,
    cells: null,
    weights: null,
    start: { row: 1, col: 1 },
    end: { row: oddInterior(rows - 2), col: oddInterior(cols - 2) },
  };
  maze.previewPath = [maze.start, maze.end];
  return maze;
}

/** 칸 배열 없이 계산하는 가상 미로 사실. 알고리즘 벤치 결과가 아니다. */
export function virtualMazeFacts(maze) {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  const { hops, waypoints } = virtualPath(maze);
  const end = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    seed: maze.seed,
    rows: maze.rows,
    cols: maze.cols,
    start: { row: maze.start.row, col: maze.start.col },
    goal: { row: maze.end.row, col: maze.end.col },
    uniquePathHops: hops,
    waypointCount: waypoints.length,
    computeMs: end - start,
    path: waypoints,
  };
}

export function materializeVirtualMaze(maze, limit = MAX_ALGO_CELLS) {
  if (!isVirtualMaze(maze)) return maze;
  if (exceedsCellLimit(maze.rows, maze.cols, limit)) {
    throw new Error("가상 미로가 너무 커서 칸 배열로 펼칠 수 없습니다.");
  }
  const next = createMaze(maze.rows, maze.cols, { start: maze.start, end: maze.end });
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      next.cells[r][c] = virtualIsWall(maze, r, c) ? CELL_WALL : CELL_EMPTY;
    }
  }
  return next;
}

export const MAX_MATERIALIZE_CELLS = 250_000;

export function prepareExperimentMaze(maze) {
  if (!isVirtualMaze(maze)) {
    const search = cloneMaze(maze);
    return {
      search,
      exactPathLength: null,
      originalVirtual: false,
      implicitOriginal: false,
      tooLarge: false,
      previewPath: null,
      graph: null,
      referenceHops: null,
      referencePath: null,
    };
  }
  if (!exceedsCellLimit(maze.rows, maze.cols, MAX_MATERIALIZE_CELLS)) {
    const search = materializeVirtualMaze(maze, MAX_MATERIALIZE_CELLS);
    return {
      search,
      exactPathLength: null,
      originalVirtual: true,
      implicitOriginal: false,
      tooLarge: false,
      materializedFromVirtual: true,
      previewPath: null,
      graph: null,
      referenceHops: null,
      referencePath: null,
    };
  }
  const search = cloneMaze(maze);
  const reference = virtualPath(search);
  return {
    search,
    exactPathLength: reference.hops,
    originalVirtual: true,
    implicitOriginal: true,
    tooLarge: true,
    previewPath: reference.waypoints,
    graph: null,
    referenceHops: reference.hops,
    referencePath: reference.waypoints,
  };
}

export function cloneMaze(maze) {
  if (isVirtualMaze(maze)) {
    return {
      virtual: true,
      rows: maze.rows,
      cols: maze.cols,
      seed: maze.seed,
      cells: null,
      weights: null,
      start: { ...maze.start },
      end: { ...maze.end },
      pathLength: maze.pathLength,
      previewPath: maze.previewPath ? maze.previewPath.map((cell) => ({ ...cell })) : null,
    };
  }
  return {
    rows: maze.rows,
    cols: maze.cols,
    cells: maze.cells.map((row) => row.slice()),
    weights: maze.weights.map((row) => row.slice()),
    start: { ...maze.start },
    end: { ...maze.end },
  };
}

export function resizeMaze(maze, rows, cols) {
  ({ rows, cols } = clampMazeShape(rows, cols));
  if (exceedsCellLimit(rows, cols)) {
    return createVirtualMaze(rows, cols, { seed: maze.seed });
  }
  if (isVirtualMaze(maze)) {
    return generateRandomMaze(rows, cols, { multiPath: true });
  }
  const next = createMaze(rows, cols);
  const copyRows = Math.min(rows, maze.rows);
  const copyCols = Math.min(cols, maze.cols);
  for (let r = 0; r < copyRows; r += 1) {
    for (let c = 0; c < copyCols; c += 1) {
      next.cells[r][c] = maze.cells[r][c];
      next.weights[r][c] = maze.weights[r][c];
    }
  }
  next.start = clampCell(maze.start, rows, cols);
  next.end = clampCell(maze.end, rows, cols);
  if (sameCell(next.start, next.end)) {
    next.end = { row: rows - 2, col: cols - 2 };
  }
  next.cells[next.start.row][next.start.col] = CELL_EMPTY;
  next.cells[next.end.row][next.end.col] = CELL_EMPTY;
  return next;
}

export function clearMaze(maze) {
  if (isVirtualMaze(maze)) return cloneMaze(maze);
  const next = cloneMaze(maze);
  for (let r = 0; r < next.rows; r += 1) {
    for (let c = 0; c < next.cols; c += 1) {
      next.cells[r][c] = CELL_EMPTY;
      next.weights[r][c] = 1;
    }
  }
  return next;
}

export function reconstructPath(parent, start, end) {
  const path = [];
  let cursor = cellKey(end.row, end.col);
  const startKey = cellKey(start.row, start.col);
  while (cursor) {
    path.push(parseKey(cursor));
    if (cursor === startKey) break;
    cursor = parent.get(cursor);
  }
  path.reverse();
  if (!path.length || !sameCell(path[0], start)) return [];
  return path;
}

export function pathCost(maze, path) {
  if (!path.length) return 0;
  let cost = 0;
  for (let i = 1; i < path.length; i += 1) {
    cost += getWeight(maze, path[i].row, path[i].col);
  }
  return cost;
}

export function isReachable(maze) {
  const visited = new Set([cellKey(maze.start.row, maze.start.col)]);
  const queue = [{ ...maze.start }];
  while (queue.length) {
    const cur = queue.shift();
    if (sameCell(cur, maze.end)) return true;
    for (const next of neighbors(maze, cur.row, cur.col)) {
      const key = cellKey(next.row, next.col);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(next);
      }
    }
  }
  return false;
}

/**
 * 재귀적 백트래커로 통로를 판 뒤, 벽을 일부 제거해 여러 경로가 생기게 한다.
 * 항상 시작점에서 목표점으로 갈 수 있다.
 */
export function generateRandomMaze(rows, cols, options = {}) {
  ({ rows, cols } = clampMazeShape(rows, cols));
  const forceGrid = Boolean(options.forceGrid);
  if (!forceGrid && exceedsCellLimit(rows, cols)) {
    return createVirtualMaze(rows, cols, options);
  }
  const rng = options.seed != null ? makeRng(options.seed) : Math.random;
  const maze = createMaze(rows, cols);
  maze.seed = options.seed != null ? options.seed | 0 : null;
  for (let r = 0; r < rows; r += 1) {
    maze.cells[r].fill(CELL_WALL);
  }

  const startRow = 1;
  const startCol = 1;
  carvePassages(maze, startRow, startCol, rng);

  maze.start = options.start
    ? { row: options.start.row, col: options.start.col }
    : { row: startRow, col: startCol };
  maze.end = options.end
    ? { row: options.end.row, col: options.end.col }
    : (!forceGrid && exceedsCellLimit(rows, cols, MAX_SEARCH_CELLS))
      ? { row: rows - 2, col: cols - 2 }
      : findFarthestCell(maze, maze.start) || { row: rows - 2, col: cols - 2 };
  maze.cells[maze.start.row][maze.start.col] = CELL_EMPTY;
  maze.cells[maze.end.row][maze.end.col] = CELL_EMPTY;

  if (options.multiPath !== false) {
    knockExtraWalls(maze, Math.max(4, Math.floor(rows * cols * 0.045)), rng);
  }

  if (!exceedsCellLimit(rows, cols, MAX_SEARCH_CELLS) && !isReachable(maze)) {
    forceCorridor(maze);
  }
  return maze;
}

export function serializeMaze(maze) {
  if (isVirtualMaze(maze)) {
    return JSON.stringify({
      virtual: true,
      rows: maze.rows,
      cols: maze.cols,
      seed: maze.seed,
      start: maze.start,
      end: maze.end,
      pathLength: maze.pathLength,
    });
  }
  return JSON.stringify(maze);
}

export function deserializeMaze(raw) {
  const maze = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!maze || !maze.start || !maze.end) {
    throw new Error("미로 데이터가 올바르지 않습니다.");
  }
  if (maze.virtual) {
    const next = createVirtualMaze(maze.rows, maze.cols, { seed: maze.seed });
    next.start = { ...maze.start };
    next.end = { ...maze.end };
    const { hops, waypoints } = virtualPath(next);
    next.pathLength = hops;
    next.previewPath = waypoints;
    return next;
  }
  if (!maze.cells) {
    throw new Error("미로 데이터가 올바르지 않습니다.");
  }
  if (!maze.weights) {
    maze.weights = maze.cells.map((row) => row.map(() => 1));
  }
  return maze;
}

export function mazeFingerprint(maze) {
  const seed = isVirtualMaze(maze) ? `|V${maze.seed}` : "";
  return `${maze.rows}x${maze.cols}|S${maze.start.row},${maze.start.col}|E${maze.end.row},${maze.end.col}${seed}`;
}

export function clampSize(n) {
  const value = Math.floor(Number(n) || MIN_MAZE_DIM);
  if (!Number.isFinite(value)) return MIN_MAZE_DIM;
  return Math.max(MIN_MAZE_DIM, Math.min(MAX_MAZE_DIM, value));
}

export function clampMazeShape(rows, cols) {
  rows = clampSize(rows);
  cols = clampSize(cols);
  return {
    rows,
    cols,
    clipped: false,
    virtual: exceedsCellLimit(rows, cols),
  };
}

function clampCell(cell, rows, cols) {
  return {
    row: Math.max(0, Math.min(rows - 1, cell.row)),
    col: Math.max(0, Math.min(cols - 1, cell.col)),
  };
}

function makeRng(seed) {
  let x = (Number(seed) >>> 0) || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function shuffle(list, rng = Math.random) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function carvePassages(maze, startRow, startCol, rng = Math.random) {
  const stack = [{ row: startRow, col: startCol }];
  maze.cells[startRow][startCol] = CELL_EMPTY;
  const jumps = [
    { dr: -2, dc: 0 },
    { dr: 2, dc: 0 },
    { dr: 0, dc: -2 },
    { dr: 0, dc: 2 },
  ];

  while (stack.length) {
    const current = stack[stack.length - 1];
    const options = shuffle(jumps, rng).filter((jump) => {
      const nr = current.row + jump.dr;
      const nc = current.col + jump.dc;
      return inBounds(maze, nr, nc) && maze.cells[nr][nc] === CELL_WALL;
    });

    if (!options.length) {
      stack.pop();
      continue;
    }

    const jump = options[0];
    const nr = current.row + jump.dr;
    const nc = current.col + jump.dc;
    maze.cells[current.row + jump.dr / 2][current.col + jump.dc / 2] = CELL_EMPTY;
    maze.cells[nr][nc] = CELL_EMPTY;
    stack.push({ row: nr, col: nc });
  }
}

function knockExtraWalls(maze, count, rng = Math.random) {
  const candidates = [];
  for (let r = 1; r < maze.rows - 1; r += 1) {
    for (let c = 1; c < maze.cols - 1; c += 1) {
      if (maze.cells[r][c] !== CELL_WALL) continue;
      const vertical =
        maze.cells[r - 1][c] === CELL_EMPTY && maze.cells[r + 1][c] === CELL_EMPTY;
      const horizontal =
        maze.cells[r][c - 1] === CELL_EMPTY && maze.cells[r][c + 1] === CELL_EMPTY;
      if (vertical !== horizontal) candidates.push({ row: r, col: c });
    }
  }
  shuffle(candidates, rng).slice(0, count).forEach((cell) => {
    maze.cells[cell.row][cell.col] = CELL_EMPTY;
  });
}

function findFarthestCell(maze, from) {
  const visited = new Set([cellKey(from.row, from.col)]);
  const queue = [{ ...from }];
  let last = { ...from };
  while (queue.length) {
    const cur = queue.shift();
    last = cur;
    for (const next of neighbors(maze, cur.row, cur.col)) {
      const key = cellKey(next.row, next.col);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(next);
      }
    }
  }
  return last;
}

function forceCorridor(maze) {
  let { row, col } = maze.start;
  maze.cells[row][col] = CELL_EMPTY;
  while (row !== maze.end.row) {
    row += row < maze.end.row ? 1 : -1;
    maze.cells[row][col] = CELL_EMPTY;
  }
  while (col !== maze.end.col) {
    col += col < maze.end.col ? 1 : -1;
    maze.cells[row][col] = CELL_EMPTY;
  }
}

export function mazeFromAscii(lines, weights = {}) {
  const rows = lines.length;
  const cols = lines[0].length;
  const maze = createMaze(rows, cols);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const ch = lines[r][c];
      if (ch === "#") maze.cells[r][c] = CELL_WALL;
      if (ch === "S") maze.start = { row: r, col: c };
      if (ch === "E") maze.end = { row: r, col: c };
    }
  }
  Object.entries(weights).forEach(([key, value]) => {
    const { row, col } = parseKey(key);
    maze.weights[row][col] = value;
  });
  return maze;
}

/**
 * 각 알고리즘의 특징이 잘 보이도록 손으로 만든 작은 교육용 미로.
 * DFS: 가까운 목표 대신 긴 막다른 길로 먼저 들어간다.
 * BFS: 물결처럼 같은 거리의 칸을 함께 넓혀 간다.
 * Dijkstra: 짧지만 비용이 큰 길과 길지만 싼 길이 함께 있다.
 * A*: 목표 방향과 우회가 함께 보여 f = g + h의 선택이 드러난다.
 * AEFS: 목표로 보이는 길이 막히면 신뢰도가 떨어지고 다시 넓게 본다.
 */
export const LEARN_MAZES = {
  dfs: mazeFromAscii([
    "#############",
    "#S          #",
    "# ###########",
    "#           #",
    "# ######### #",
    "#          E#",
    "#############",
  ]),
  bfs: mazeFromAscii([
    "###########",
    "#S        #",
    "# ## ## # #",
    "# #     # #",
    "#   ##    #",
    "##     #  #",
    "#  ## #  ##",
    "#      # E#",
    "###########",
  ]),
  dijkstra: (() => {
    const maze = mazeFromAscii([
      "#############",
      "#S         E#",
      "# ######### #",
      "#           #",
      "# ######### #",
      "#           #",
      "#############",
    ]);
    for (let c = 2; c <= 10; c += 1) maze.weights[1][c] = 5;
    return maze;
  })(),
  astar: mazeFromAscii([
    "###############",
    "#S            #",
    "# ########### #",
    "#           # #",
    "#           #E#",
    "###############",
  ]),
  aefs: mazeFromAscii([
    "#################",
    "#S            #E#",
    "# ############# #",
    "#               #",
    "#################",
  ]),
};

LEARN_MAZES.aefsq = LEARN_MAZES.aefs;
LEARN_MAZES.greedy = LEARN_MAZES.astar;
LEARN_MAZES.bibfs = LEARN_MAZES.bfs;
LEARN_MAZES.hfgs = LEARN_MAZES.aefs;
LEARN_MAZES.hfgsnp = LEARN_MAZES.aefs;
LEARN_MAZES.hfgsrt = LEARN_MAZES.aefs;
LEARN_MAZES.hfgsse = LEARN_MAZES.aefs;
LEARN_MAZES.hfgss = LEARN_MAZES.aefs;
LEARN_MAZES.rim = LEARN_MAZES.aefs;
LEARN_MAZES.pair = LEARN_MAZES.bfs;
LEARN_MAZES.tier = LEARN_MAZES.bfs;
LEARN_MAZES.bpbfs = LEARN_MAZES.bfs;
LEARN_MAZES.sley = mazeFromAscii([
  "###############",
  "#S    #       #",
  "# ### # ##### #",
  "#   # #     # #",
  "### # ##### # #",
  "#   #       # #",
  "# # ######### #",
  "# #         #E#",
  "###############",
]);
LEARN_MAZES.jps4 = LEARN_MAZES.bfs;

export const ALGO_META = {
  dfs: {
    id: "dfs",
    name: "깊이 우선 탐색",
    short: "DFS",
    analogy: "일단 한 방향으로 끝까지 가보자!",
    color: "#6366f1",
  },
  bfs: {
    id: "bfs",
    name: "너비 우선 탐색",
    short: "BFS",
    analogy: "가까운 곳부터 차례대로 찾아보자.",
    color: "#0284c7",
  },
  dijkstra: {
    id: "dijkstra",
    name: "다익스트라",
    short: "Dijkstra",
    analogy: "지금까지 이동하는 비용이 적은 곳부터 찾아보자.",
    color: "#d97706",
  },
  astar: {
    id: "astar",
    name: "에이 스타",
    short: "A*",
    analogy: "목표까지 얼마나 가까운지도 생각하면서 찾아보자.",
    color: "#059669",
  },
  aefs: {
    id: "aefs",
    name: "적응형 증거 탐색",
    short: "AEFS",
    analogy: "지금까지의 정보가 믿을 만한지 보고, 넓게 볼지 목표로 갈지 바꾸자.",
    color: "#be185d",
  },
  aefsq: {
    id: "aefsq",
    name: "양자화 AEFS",
    short: "AEFS-Q",
    analogy: "비슷한 우선순위는 한 버킷으로 묶고, 믿을 수 있을 때만 목표 쪽으로 가자.",
    color: "#a21caf",
  },
  greedy: {
    id: "greedy",
    name: "탐욕 최선 우선",
    short: "Greedy",
    analogy: "목표에 가까워 보이는 칸만 보고 가자.",
    color: "#ea580c",
  },
  bibfs: {
    id: "bibfs",
    name: "양방향 BFS",
    short: "Bi-BFS",
    analogy: "시작과 목표에서 동시에 퍼져 만나자.",
    color: "#0891b2",
  },
  hfgs: {
    id: "hfgs",
    name: "하드웨어 피드백 탐색",
    short: "HFGS",
    analogy: "지금 이 컴퓨터에서 실제로 빠른 탐색 방식을 재며 바꾸자.",
    color: "#0f766e",
  },
  hfgsnp: {
    id: "hfgsnp",
    name: "HFGS (probe 없음)",
    short: "HFGS-no-probe",
    analogy: "측정은 하되, 짧게 시험해 보지 않고 전략만 바꾼다.",
    color: "#115e59",
  },
  hfgsrt: {
    id: "hfgsrt",
    name: "HFGS (runtime만)",
    short: "HFGS-runtime",
    analogy: "노드 처리량과 실행시간만 보고 전략을 바꾼다.",
    color: "#134e4a",
  },
  hfgsse: {
    id: "hfgsse",
    name: "HFGS (탐색 통계만)",
    short: "HFGS-search",
    analogy: "프론티어와 진행도만 보고 전략을 바꾼다.",
    color: "#3f6212",
  },
  hfgss: {
    id: "hfgss",
    name: "HFGS-safe (별도 모드)",
    short: "HFGS-safe",
    analogy: "HFGS와 같은 측정·전환 규칙이지만, 최단 비용을 지키는 g 순서와 A*만 오간다.",
    color: "#14532d",
  },
  rim: {
    id: "rim",
    name: "가장자리 보폭 탐색",
    short: "RIM",
    analogy: "경계에 늘어선 칸을, 붙은 벽의 수만큼 건너뛰어 고르자.",
    color: "#0369a1",
  },
  pair: {
    id: "pair",
    name: "양쪽 최단 탐색",
    short: "PAIR",
    analogy: "비용이 같으면 양쪽에서 같은 거리로 만나고, 비용이 다르면 실제 비용이 작은 칸부터 가자.",
    color: "#7c3aed",
  },
  tier: {
    id: "tier",
    name: "행 비트 전파",
    short: "TIER",
    analogy: "칸을 하나씩 꺼내지 말고, 한 줄을 비트로 묶어 위아래좌우로 한 칸씩 동시에 밀자.",
    color: "#b45309",
  },
  bpbfs: {
    id: "bpbfs",
    name: "비트 병렬 BFS",
    short: "BP-BFS",
    analogy: "큐 대신 비트판에서 한 세대의 이웃을 한꺼번에 켜자.",
    color: "#0e7490",
  },
  sley: {
    id: "sley",
    name: "살대 북 탐색",
    short: "SLEY",
    analogy: "같은 비용 층의 구슬만 열 막대에 두고, 북이 가리키는 살부터 집자.",
    color: "#9f1239",
  },
  jps4: {
    id: "jps4",
    name: "4방향 점프 지점 탐색",
    short: "JPS4",
    analogy: "직선 복도는 건너뛰고, 갈림이나 목표가 있는 점프 지점만 열자.",
    color: "#4d7c0f",
  },
};
