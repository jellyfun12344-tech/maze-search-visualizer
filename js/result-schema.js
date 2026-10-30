export const SOLVER_NAMES = {
  dfs: "dfs.js::runDFS",
  bfs: "bfs.js::runBFS",
  dijkstra: "dijkstra.js::runDijkstra",
  astar: "astar.js::runAStar",
  greedy: "greedy.js::runGreedy",
  bibfs: "bidirectional.js::runBidirectionalBFS",
  pair: "pair.js::runPAIR",
  tier: "tier.js::runTIER",
  rim: "rim.js::runRIM",
  sley: "sley.js::runSLEY",
  aefs: "aefs.js::runAEFS",
  aefsq: "aefs.js::runAEFSQ",
  hfgs: "hfgs.js::runHFGS",
  hfgsnp: "hfgs.js::runHFGSNoProbe",
  hfgsrt: "hfgs.js::runHFGSRuntimeOnly",
  hfgsse: "hfgs.js::runHFGSSearchOnly",
  hfgss: "hfgs.js::runHFGSSafe",
  bpbfs: "bpbfs.js::runBPBFS",
  jps4: "jps4.js::runJPS4",
};

export const GROUP_A = ["bfs", "dijkstra", "astar", "bibfs", "pair", "tier"];
export const GROUP_B = ["dfs", "greedy", "rim", "hfgs"];

export const TABLE_COLUMNS = [
  { key: "algorithm", header: "Algorithm" },
  { key: "size", header: "Size" },
  { key: "branch", header: "Branch" },
  { key: "verification", header: "Verification" },
  { key: "guarantee", header: "최단 보장" },
  { key: "meanTimeMs", header: "Mean time" },
  { key: "medianTimeMs", header: "Median" },
  { key: "p95TimeMs", header: "P95" },
  { key: "stdTimeMs", header: "Std" },
  { key: "minTimeMs", header: "Min" },
  { key: "maxTimeMs", header: "Max" },
  { key: "expansionUnit", header: "노드 집계 단위" },
  { key: "meanDiscovered", header: "Mean discovered" },
  { key: "meanExpansions", header: "Mean expanded" },
  { key: "medianExpansions", header: "Median expanded" },
  { key: "p95Expansions", header: "P95 expanded" },
  { key: "meanPathLength", header: "Mean path length" },
  { key: "meanPathCost", header: "Mean path cost" },
  { key: "successRate", header: "Success" },
  { key: "pathValidity", header: "Path validity" },
  { key: "optimality", header: "이번 실행 최단 일치" },
  { key: "unverified", header: "검증 못 한 항목" },
  { key: "heuristicEvals", header: "Heuristic evals" },
  { key: "queueOps", header: "Queue ops" },
  { key: "maxFrontier", header: "평균 최대 프런티어 크기" },
  { key: "bitOps", header: "Bit ops" },
  { key: "warning", header: "Warning" },
];

export const EXPANSION_UNIT_LABELS = {
  cells: "칸",
  "jump-points": "점프 지점",
  "cell-bits": "비트 세대의 칸",
};

function percentText(rate) {
  return rate == null ? "—" : `${Math.round(Number(rate) * 100)}%`;
}

/**
 * 실험 보고서의 한 알고리즘 결과를 화면 표의 한 행으로 바꾼다.
 * ui.js와 테스트가 같은 함수를 쓴다. 표에 나오는 숫자는 report.results[id]의 값을 그대로 옮긴 것이다.
 */
export function buildResultRow(report, id, short = id) {
  const r = report.results[id];
  const measured = r.measured !== false;
  const pathOk = measured
    && r.pathLengthSource !== "unique-tree-hops"
    && !illegalPathLength(report.mazeSize.rows, report.mazeSize.cols, r.avgPathLength);
  const counts = r.optimalityStatusCounts || {};
  const unreachableOnly = r.pathValidityRate == null && Object.keys(counts).length > 0
    && Object.keys(counts).every((k) => k === "unreachable-agrees");
  let verification;
  if (!measured) verification = "미실행";
  else if (!r.sampleCount) verification = "검증되지 않음";
  else if (unreachableOnly) verification = "도달 불가 일치";
  else if (r.pathValidityRate === 1 && r.optimalityVerifiedRate === 1) verification = "경로·최단";
  else if (r.pathValidityRate === 1) verification = "경로만";
  else verification = "실패";
  let guarantee;
  if (!measured) guarantee = "미실행";
  else if (r.guaranteeMixed) guarantee = "미로마다 다름";
  else guarantee = r.guaranteesOptimality ? "보장" : "보장 안 함";
  const unverified = [];
  if (!measured) unverified.push("전체(실행하지 않음)");
  if (counts["unsupported-negative-cost"]) unverified.push("최단 비용(음수 비용이라 기준 없음)");
  if (counts["not-verified"]) unverified.push("최단 비용");
  if (r.expansionUnit === "jump-points") unverified.push("칸 확장 수(점프 지점으로 셈)");
  if (r.expansionUnit === "cell-bits") unverified.push("이웃 후보 수(비트 단위로 셈)");
  if (String(id).startsWith("hfgs")) unverified.push("하드웨어 카운터(브라우저에서 읽지 못함)");
  const unit = r.expansionUnit || r.visitedUnit || "cells";
  return {
    algorithm: short,
    size: `${report.mazeSize.rows}×${report.mazeSize.cols}`,
    branch: r.solver ? `${r.solver} / ${r.searchMode || "—"}` : (r.searchMode || "—"),
    verification,
    guarantee,
    meanTimeMs: r.avgTimeMs,
    medianTimeMs: r.medianTimeMs,
    p95TimeMs: r.p95TimeMs,
    stdTimeMs: r.stdevTimeMs,
    minTimeMs: r.minTimeMs,
    maxTimeMs: r.maxTimeMs,
    expansionUnit: EXPANSION_UNIT_LABELS[unit] || unit,
    meanDiscovered: r.avgDiscoveredCount ?? r.avgDiscoveredNodes,
    meanExpansions: r.avgExpandedCount ?? r.avgExpandedNodes ?? r.avgVisited,
    medianExpansions: r.medianExpandedCount ?? r.medianVisited,
    p95Expansions: r.p95ExpandedCount ?? r.p95Visited,
    meanPathLength: pathOk ? r.avgPathLength : null,
    meanPathCost: pathOk ? r.pathCost : null,
    successRate: r.foundRate == null ? (r.found ? "예" : "아니오") : percentText(r.foundRate),
    pathValidity: percentText(r.pathValidityRate),
    optimality: percentText(r.optimalityVerifiedRate),
    unverified: unverified.join("; ") || "—",
    heuristicEvals: r.heuristicEvals,
    queueOps: id === "tier" ? null : r.queueOps,
    maxFrontier: r.peakFrontier,
    bitOps: r.bitsetOperations,
    warning: (r.warnings || []).join("; "),
  };
}

export const MAX_CELL_SEARCH = 250_000;

export function isCellSearchable(rows, cols) {
  const cells = Number(rows) * Number(cols);
  return Number.isFinite(cells) && cells > 0 && cells <= MAX_CELL_SEARCH;
}

export function maxLegalPathLength(rows, cols) {
  return Math.max(0, Number(rows) * Number(cols));
}

export function mazeContentHash(maze) {
  if (maze.virtual) {
    return `virtual:${maze.seed}:${maze.rows}x${maze.cols}:${maze.start.row},${maze.start.col}:${maze.end.row},${maze.end.col}`;
  }
  let hash = 2166136261;
  const mix = (value) => {
    hash ^= value | 0;
    hash = Math.imul(hash, 16777619);
  };
  mix(maze.rows);
  mix(maze.cols);
  mix(maze.start.row);
  mix(maze.start.col);
  mix(maze.end.row);
  mix(maze.end.col);
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      mix(maze.cells[r][c]);
      mix(maze.weights ? maze.weights[r][c] || 1 : 1);
    }
  }
  return (hash >>> 0).toString(16);
}

export function countCells(maze) {
  if (maze.virtual || !maze.cells) {
    return { walls: null, open: null };
  }
  let walls = 0;
  let open = 0;
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      if (maze.cells[r][c] === 1) walls += 1;
      else open += 1;
    }
  }
  return { walls, open };
}

export function makeRawRecord(fields) {
  return {
    seed: fields.seed,
    mazeHash: fields.mazeHash,
    width: fields.width,
    height: fields.height,
    algorithm: fields.algorithm,
    branch: fields.branch,
    solver: fields.solver,
    runtimeMs: fields.runtimeMs,
    expandedNodes: fields.expandedNodes,
    generatedNodes: fields.generatedNodes,
    pathLength: fields.pathLength,
    pathCost: fields.pathCost,
    success: fields.success,
    verificationPassed: fields.verificationPassed,
    optimalityGuaranteed: fields.optimalityGuaranteed,
    optimalityVerified: fields.optimalityVerified,
    heuristicEvals: fields.heuristicEvals ?? null,
    queueOps: fields.queueOps ?? null,
    heapPushes: fields.heapPushes ?? null,
    heapPops: fields.heapPops ?? null,
    maxFrontier: fields.maxFrontier ?? null,
    bitOps: fields.bitOps ?? null,
    generations: fields.generations ?? null,
    activeRows: fields.activeRows ?? null,
    activeBits: fields.activeBits ?? null,
    warnings: fields.warnings ?? [],
  };
}

export function statRowFromNamed(row) {
  return {
    algorithm: row.algorithm,
    size: row.size ?? "—",
    branch: row.branch ?? "—",
    verification: row.verification ?? "—",
    guarantee: row.guarantee ?? "—",
    meanTimeMs: row.meanTimeMs,
    medianTimeMs: row.medianTimeMs,
    p95TimeMs: row.p95TimeMs,
    stdTimeMs: row.stdTimeMs,
    minTimeMs: row.minTimeMs,
    maxTimeMs: row.maxTimeMs,
    expansionUnit: row.expansionUnit ?? "—",
    meanDiscovered: row.meanDiscovered,
    meanExpansions: row.meanExpansions,
    medianExpansions: row.medianExpansions,
    p95Expansions: row.p95Expansions,
    meanPathLength: row.meanPathLength,
    meanPathCost: row.meanPathCost ?? null,
    successRate: row.successRate,
    pathValidity: row.pathValidity,
    optimality: row.optimality,
    unverified: row.unverified ?? "—",
    heuristicEvals: row.heuristicEvals,
    queueOps: row.queueOps,
    maxFrontier: row.maxFrontier,
    bitOps: row.bitOps,
    warning: row.warning ?? "",
  };
}

export function tableCells(row) {
  const named = statRowFromNamed(row);
  const cells = TABLE_COLUMNS.map((col) => named[col.key]);
  if (cells.length !== TABLE_COLUMNS.length) {
    throw new Error(`열 수 불일치: ${cells.length} !== ${TABLE_COLUMNS.length}`);
  }
  TABLE_COLUMNS.forEach((col) => {
    if (!Object.prototype.hasOwnProperty.call(named, col.key)) {
      throw new Error(`없는 열: ${col.key}`);
    }
  });
  return cells;
}

export function formatCell(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "비정상";
    if (Math.abs(value) >= 1000) return String(Math.round(value));
    return Number(value).toFixed(value < 10 ? 4 : 2);
  }
  return String(value);
}

export function markdownTable(rows) {
  const header = `| ${TABLE_COLUMNS.map((col) => col.header).join(" | ")} |`;
  const align = `| ${TABLE_COLUMNS.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => {
    const cells = tableCells(row).map((value) => formatCell(value));
    if (cells.length !== TABLE_COLUMNS.length) {
      throw new Error("Markdown 열 수가 헤더와 다릅니다");
    }
    return `| ${cells.join(" | ")} |`;
  });
  return [header, align, ...body].join("\n");
}

export function illegalPathLength(rows, cols, pathLength) {
  if (pathLength == null || !Number.isFinite(pathLength)) return true;
  if (pathLength < 0) return true;
  const max = maxLegalPathLength(rows, cols);
  if (!Number.isFinite(max) || max > Number.MAX_SAFE_INTEGER) {
    return pathLength > Number.MAX_SAFE_INTEGER;
  }
  return pathLength > max;
}
