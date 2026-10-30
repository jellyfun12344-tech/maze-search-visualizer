import { cloneMaze, getCell, prepareExperimentMaze } from "./maze.js";
import { illegalPathLength, mazeContentHash, SOLVER_NAMES } from "./result-schema.js";
import { certifyRun, costModel, MOVE_RULE, ORACLE_VERSION, referenceSolve, validatePath } from "./oracle.js";
import { runDFS } from "./algorithms/dfs.js";
import { runBFS } from "./algorithms/bfs.js";
import { runDijkstra } from "./algorithms/dijkstra.js";
import { runAStar } from "./algorithms/astar.js";
import { runAEFS, runAEFSQ } from "./algorithms/aefs.js";
import { runGreedy } from "./algorithms/greedy.js";
import { runBidirectionalBFS } from "./algorithms/bidirectional.js";
import {
  runHFGS,
  runHFGSNoProbe,
  runHFGSRuntimeOnly,
  runHFGSSafe,
  runHFGSSearchOnly,
} from "./algorithms/hfgs.js";
import { runRIM } from "./algorithms/rim.js";
import { runPAIR } from "./algorithms/pair.js";
import { runTIER } from "./algorithms/tier.js";
import { runBPBFS } from "./algorithms/bpbfs.js";
import { runSLEY } from "./algorithms/sley.js";
import { runJPS4 } from "./algorithms/jps4.js";
import { IMPLEMENTATION_VERSION, METRICS_CONTRACT } from "./algorithms/common.js";

export const RUNNERS = {
  dfs: runDFS,
  bfs: runBFS,
  dijkstra: runDijkstra,
  astar: runAStar,
  greedy: runGreedy,
  bibfs: runBidirectionalBFS,
  aefs: runAEFS,
  aefsq: runAEFSQ,
  hfgs: runHFGS,
  hfgsnp: runHFGSNoProbe,
  hfgsrt: runHFGSRuntimeOnly,
  hfgsse: runHFGSSearchOnly,
  hfgss: runHFGSSafe,
  rim: runRIM,
  pair: runPAIR,
  tier: runTIER,
  bpbfs: runBPBFS,
  sley: runSLEY,
  jps4: runJPS4,
};

const NOT_GUARANTEED = (reason) => () => ({ guaranteed: false, condition: reason });
const UNIT_ONLY = (what) => (m) => (m.uniform
  ? { guaranteed: true, condition: `모든 칸 비용 1, 4방향 격자 (${what})` }
  : { guaranteed: false, condition: "칸 비용이 1이 아닌 칸이 있어 최단 비용을 보장하지 않음" });
const ASTAR_RULE = (what) => (m) => {
  if (m.negative) return { guaranteed: false, condition: "음수 비용" };
  if (m.belowOne) return { guaranteed: false, condition: "1보다 작은 칸 비용: 맨해튼 휴리스틱이 과대평가할 수 있음" };
  return { guaranteed: true, condition: `칸 비용 ≥ 1이라 맨해튼이 허용·일관적 (${what})` };
};
const BUCKET_RULE = (what) => (m) => {
  if (m.negative || m.nonInteger || m.belowOne) return { guaranteed: false, condition: "정수 ≥ 1이 아닌 칸 비용: 비용 층/버킷 번호로 쓸 수 없어 실행하지 않음" };
  return { guaranteed: true, condition: `칸 비용이 정수 ≥ 1 (${what})` };
};

/**
 * 알고리즘별 최단 보장 조건. 이름이 아니라 구현과 실행 설정(비용 모델)으로 정한다.
 * 근거는 benchmark_audit/audit5/OPTIMALITY_TABLE.md에 있다.
 */
export const ALGORITHM_INFO = {
  dfs: { guarantee: NOT_GUARANTEED("깊이 우선: 처음 닿은 길을 반환"), expansionUnit: "cells" },
  bfs: { guarantee: UNIT_ONLY("FIFO 층 순서"), expansionUnit: "cells" },
  dijkstra: {
    guarantee: (m) => (m.negative
      ? { guaranteed: false, condition: "음수 비용" }
      : { guaranteed: true, condition: "음수 없는 칸 비용, 확정 시 g 최소" }),
    expansionUnit: "cells",
  },
  astar: { guarantee: ASTAR_RULE("닫힌 칸 재개방 없음"), expansionUnit: "cells" },
  greedy: { guarantee: NOT_GUARANTEED("h만 보고 고름"), expansionUnit: "cells" },
  bibfs: { guarantee: UNIT_ONLY("층 단위 확장 + μ 하한 종료"), expansionUnit: "cells" },
  aefs: { guarantee: NOT_GUARANTEED("발견 모드: 목표를 처음 꺼내면 종료"), expansionUnit: "cells" },
  aefsq: { guarantee: NOT_GUARANTEED("발견 모드: 목표를 처음 꺼내면 종료"), expansionUnit: "cells" },
  hfgs: { guarantee: NOT_GUARANTEED("DFS·Greedy 전략으로 닫은 칸을 다시 열지 않음"), expansionUnit: "cells" },
  hfgsnp: { guarantee: NOT_GUARANTEED("DFS·Greedy 전략으로 닫은 칸을 다시 열지 않음"), expansionUnit: "cells" },
  hfgsrt: { guarantee: NOT_GUARANTEED("DFS·Greedy 전략으로 닫은 칸을 다시 열지 않음"), expansionUnit: "cells" },
  hfgsse: { guarantee: NOT_GUARANTEED("DFS·Greedy 전략으로 닫은 칸을 다시 열지 않음"), expansionUnit: "cells" },
  hfgss: { guarantee: ASTAR_RULE("g 순서·A*만 전환"), expansionUnit: "cells" },
  rim: { guarantee: NOT_GUARANTEED("경계 줄 보폭 선택, 거리 비교 없음"), expansionUnit: "cells" },
  pair: {
    guarantee: (m) => (m.uniform
      ? { guaranteed: true, condition: "모든 칸 비용 1, 4방향 격자(이분 그래프)에서 첫 맞닿음 — OPTIMALITY_TABLE.md 증명" }
      : ASTAR_RULE("가중 미로에서는 A*")(m)),
    expansionUnit: "cells",
  },
  tier: {
    guarantee: (m) => (m.uniform ? UNIT_ONLY("행 비트 양방향 세대")(m) : BUCKET_RULE("비용 버킷")(m)),
    expansionUnit: "cell-bits",
  },
  bpbfs: { guarantee: UNIT_ONLY("비트 세대 = 걸음 수"), expansionUnit: "cell-bits" },
  sley: { guarantee: BUCKET_RULE("비용 층(Dial)"), expansionUnit: "cells" },
  jps4: {
    guarantee: (m) => (m.uniform ? UNIT_ONLY("4방향 점프 지점")(m) : ASTAR_RULE("가중 미로에서는 A*")(m)),
    expansionUnit: "jump-points",
  },
};

export const TIMING_SCOPE = {
  includes: [
    "알고리즘 함수 호출 전체 (입력 검증, 비용 모델 검사, 자료구조 할당, 탐색, 계수기 갱신)",
  ],
  excludes: [
    "미로 생성·복사 (clonePrepMs로 따로 잼)",
    "경로 복원 (skipPath=true로 실행, 복원 시간은 상세 실행의 pathReconstructionMs)",
    "단계 기록(recordSteps), UI 렌더링·애니메이션",
    "독립 검증기(oracle) 기준 계산",
    "워밍업 실행",
  ],
  note: "계수기(Set/카운터)는 일부 알고리즘에서 방문 기록과 같은 자료구조라 시간 측정 실행에서도 켜져 있다.",
};

const WARMUP_RUNS = 2;

export function hasUnevenWeight(maze) {
  if (!maze?.cells || !maze.weights) return false;
  return !costModel(maze).uniform;
}

function notMeasuredResult(reason) {
  return {
    found: false,
    success: false,
    measured: false,
    terminationReason: "not-run",
    path: [],
    pathLength: null,
    pathCost: null,
    visitedCount: null,
    steps: [],
    searchMode: `not-run:${reason}`,
    solver: null,
    verificationPassed: false,
    metricsContract: METRICS_CONTRACT,
    warnings: ["칸 배열을 만들 수 없어 이 알고리즘의 실제 탐색을 실행하지 않았습니다"],
  };
}

function nowNs() {
  if (typeof process !== "undefined" && typeof process.hrtime?.bigint === "function") {
    return Number(process.hrtime.bigint());
  }
  return performance.now() * 1e6;
}

function innerLoopsFor(maze) {
  if (!maze || maze.virtual || maze.cells == null) return 1;
  const n = maze.rows * maze.cols;
  if (n <= 21 * 21) return 1000;
  if (n <= 51 * 51) return 200;
  if (n <= 101 * 101) return 50;
  if (n <= 201 * 201) return 10;
  return 4;
}

export function runAlgorithm(id, maze, options = {}) {
  const runner = RUNNERS[id];
  if (!runner) {
    throw new Error(`알 수 없는 알고리즘: ${id}`);
  }
  const prepared = prepareExperimentMaze(maze);
  if (prepared.tooLarge) return notMeasuredResult("maze-too-large");
  return runner(cloneMaze(prepared.search), options);
}

export function benchmarkAlgorithms(maze, algorithmIds, repeats, options = {}) {
  return collectBatch([maze], algorithmIds, repeats, null, false, options);
}

export async function benchmarkBatch(mazes, algorithmIds, repeats, onProgress, options = {}) {
  return collectBatch(mazes, algorithmIds, repeats, onProgress, true, options);
}

/** 알고리즘·설정·비용 모델로 정한 보장 여부와 조건. */
export function guaranteeInfo(id, maze) {
  const info = ALGORITHM_INFO[id];
  if (!info) return { guaranteed: false, condition: "등록되지 않은 알고리즘" };
  if (!maze?.cells) return { guaranteed: false, condition: "칸 배열 없음 (가상 미로)" };
  return info.guarantee(costModel(maze));
}

export function guaranteesOptimality(id, maze) {
  return guaranteeInfo(id, maze).guaranteed;
}

/**
 * 이전 호출 형식을 유지한다. 판정은 독립 검증기(oracle.js)가 한다.
 * 실패 결과는 이전처럼 ok=false, issues=["not-found"]로 돌려준다.
 */
export function checkPathValidity(maze, result) {
  if (!result || result.measured === false) return { ok: false, issues: ["not-measured"] };
  if (!result.found) return { ok: false, issues: ["not-found"] };
  const v = validatePath(maze, result);
  const issues = v.issues.slice();
  if (illegalPathLength(maze.rows, maze.cols, result.pathLength)) issues.push("illegal-length");
  return { ok: issues.length === 0, issues };
}

/**
 * 한 실행을 판정한다. referenceLength·referenceCost 인자는 이전 호출 형식 때문에 남겨 두었고,
 * 판정에는 쓰지 않는다. 기준은 항상 oracle의 독립 BFS/Dijkstra다.
 */
export function evaluateResult(id, maze, result, _referenceLength, _referenceCost, reference = null) {
  const ref = reference || referenceSolve(maze);
  const g = guaranteeInfo(id, maze);
  const cert = certifyRun(maze, result, ref, g.guaranteed);
  const legacyIssues = !result?.found ? ["not-found"] : cert.pathValidityIssues;
  const correct = cert.reachabilityAgrees === true
    && (cert.optimalityStatus === "unreachable-agrees"
      || cert.optimalityStatus === "invalid-input-rejected"
      || (g.guaranteed ? cert.optimalityVerified === true : cert.pathValidityPassed === true));
  return {
    success: cert.success,
    pathValidityPassed: cert.pathValidityPassed,
    pathValidityIssues: legacyIssues,
    guaranteesOptimality: g.guaranteed,
    guaranteeCondition: g.condition,
    optimalityVerified: cert.optimalityVerified,
    optimalityStatus: cert.optimalityStatus,
    reachabilityAgrees: cert.reachabilityAgrees,
    referenceStatus: cert.referenceStatus,
    referenceMethod: cert.referenceMethod,
    referenceReachable: cert.referenceReachable,
    referenceDistance: cert.referenceDistance,
    referenceCost: cert.referenceCost,
    recomputedHops: cert.recomputedHops,
    recomputedCost: cert.recomputedCost,
    terminationReason: result?.terminationReason ?? null,
    correct,
    oracleVersion: ORACLE_VERSION,
  };
}

/** UI 학습 화면처럼 한 번만 실행한 결과를 판정할 때 쓴다. */
export function certifyAlgorithmRun(id, maze, result) {
  const prepared = prepareExperimentMaze(maze);
  if (prepared.tooLarge || result?.measured === false) {
    return {
      success: false,
      pathValidityPassed: null,
      guaranteesOptimality: false,
      guaranteeCondition: "실행하지 않음",
      optimalityVerified: null,
      optimalityStatus: "not-run",
      expansionUnit: ALGORITHM_INFO[id]?.expansionUnit ?? "cells",
    };
  }
  const ev = evaluateResult(id, prepared.search, result);
  return { ...ev, expansionUnit: result?.expansionUnit ?? ALGORITHM_INFO[id]?.expansionUnit ?? "cells" };
}

function emptyBag() {
  return {
    times: [],
    visited: [],
    pathLengths: [],
    pathCosts: [],
    heuristicEvals: [],
    queueOps: [],
    heapPushes: [],
    heapPops: [],
    peakFrontier: [],
    confidenceEnds: [],
    discoveredCells: [],
    bitsetOperations: [],
    roomsExpanded: [],
    founds: 0,
    path: [],
    searchMode: null,
    solver: null,
    visitedUnit: null,
    pathLengthSource: null,
    quantized: false,
    measured: true,
    warnings: [],
    bitShifts: [],
    bitAnds: [],
    bitOrs: [],
    generations: [],
    expandedNodes: [],
    generatedNodes: [],
    discoveredNodes: [],
    queuePushes: [],
    queuePops: [],
    searchTimes: [],
    totalTimes: [],
    pathMs: [],
    pathValidity: [],
    optimality: [],
    correct: [],
    guarantees: [],
    guaranteeConditions: new Set(),
    statusCounts: {},
    v2Discovered: [],
    v2Expanded: [],
    v2Generated: [],
    v2Reencountered: [],
    expansionUnits: new Set(),
    raw: [],
  };
}

function runFresh(id, prepared, copy, options = {}) {
  if (prepared.tooLarge) return notMeasuredResult("maze-too-large");
  const maze = copy || cloneMaze(prepared.search);
  return RUNNERS[id](maze, { recordSteps: false, ...options });
}

function collectBatch(mazes, algorithmIds, repeats, onProgress, yieldEachMaze, options = {}) {
  const bags = {};
  algorithmIds.forEach((id) => {
    bags[id] = emptyBag();
  });
  const experimentId = options.experimentId || `exp-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const warmupRuns = Number.isInteger(options.warmupRuns) ? options.warmupRuns : WARMUP_RUNS;

  const runMeasured = (setup, mazeIndex, id, i, orderIndex, mazeMeta) => {
    const { prepared, reference, meta } = setup;
    onProgress?.({
      mazeIndex: mazeIndex + 1,
      mazeCount: mazes.length,
      algorithm: id,
      repeat: i + 1,
      repeats,
    });
    const bag = bags[id];
    const inner = prepared.tooLarge ? 1 : innerLoopsFor(prepared.search);
    const copies = [];
    const tPrep0 = nowNs();
    for (let k = 0; k < inner; k += 1) {
      copies.push(prepared.tooLarge ? null : cloneMaze(prepared.search));
    }
    const tPrep1 = nowNs();
    let last = null;
    const t0 = nowNs();
    for (let k = 0; k < inner; k += 1) {
      last = runFresh(id, prepared, copies[k], { skipPath: true });
    }
    const t1 = nowNs();
    if (last && last.measured === false) {
      bag.measured = false;
      bag.searchMode = last.searchMode;
      bag.solver = last.solver || bag.solver;
      (last.warnings || []).forEach((text) => {
        if (!bag.warnings.includes(text)) bag.warnings.push(text);
      });
      bag.statusCounts["not-run"] = (bag.statusCounts["not-run"] || 0) + 1;
      return;
    }
    const full = prepared.tooLarge
      ? last
      : runFresh(id, prepared, cloneMaze(prepared.search), { skipPath: false });
    const evals = evaluateResult(id, prepared.search, full, null, null, reference);
    const warnings = [];
    if (evals.reachabilityAgrees === false) warnings.push(`도달 가능성 불일치: ${evals.optimalityStatus}`);
    else if (evals.success && !evals.pathValidityPassed) warnings.push(`경로 유효성: ${evals.pathValidityIssues.join(",")}`);
    else if (evals.guaranteesOptimality && evals.optimalityVerified === false) {
      warnings.push("이론상 최단을 보장하나 이번 입력에서 기준과 다름");
    }
    const searchMs = (t1 - t0) / 1e6 / inner;
    const totalMs = (t1 - tPrep0) / 1e6 / inner;
    bag.times.push(searchMs);
    bag.searchTimes.push(searchMs);
    bag.totalTimes.push(totalMs);
    if (full.pathReconstructionMs != null) bag.pathMs.push(full.pathReconstructionMs);
    bag.innerLoops = inner;
    bag.warmupRuns = warmupRuns;
    if (full.expandedNodes != null) bag.visited.push(full.expandedNodes);
    else if (full.visitedCount != null) bag.visited.push(full.visitedCount);
    if (full.discoveredNodes != null) bag.discoveredNodes.push(full.discoveredNodes);
    bag.discoveredCells.push(full.discoveredNodes ?? full.discoveredCells ?? full.visitedCount);
    if (full.discoveredCount != null) bag.v2Discovered.push(full.discoveredCount);
    if (full.expandedCount != null) bag.v2Expanded.push(full.expandedCount);
    if (full.generatedCount != null) bag.v2Generated.push(full.generatedCount);
    if (full.reencounteredCount != null) bag.v2Reencountered.push(full.reencounteredCount);
    bag.expansionUnits.add(full.expansionUnit || ALGORITHM_INFO[id]?.expansionUnit || "cells");
    if (full.found && evals.pathValidityPassed) {
      bag.pathLengths.push(full.pathLength);
      bag.pathCosts.push(full.pathCost);
      bag.founds += 1;
    }
    if (evals.pathValidityPassed != null) bag.pathValidity.push(evals.pathValidityPassed ? 1 : 0);
    if (evals.optimalityVerified != null) bag.optimality.push(evals.optimalityVerified ? 1 : 0);
    bag.correct.push(evals.correct ? 1 : 0);
    bag.guarantees.push(evals.guaranteesOptimality ? 1 : 0);
    bag.guaranteeConditions.add(evals.guaranteeCondition);
    bag.statusCounts[evals.optimalityStatus] = (bag.statusCounts[evals.optimalityStatus] || 0) + 1;
    if (full.heuristicEvals != null) bag.heuristicEvals.push(full.heuristicEvals);
    if (full.queueOps != null) bag.queueOps.push(full.queueOps);
    if (full.heapPushes != null) bag.heapPushes.push(full.heapPushes);
    if (full.heapPops != null) bag.heapPops.push(full.heapPops);
    if (full.peakFrontier != null) bag.peakFrontier.push(full.peakFrontier);
    if (full.confidenceEnd != null) bag.confidenceEnds.push(full.confidenceEnd);
    if (full.bitsetOperations != null) bag.bitsetOperations.push(full.bitsetOperations);
    if (full.bitShifts != null) bag.bitShifts.push(full.bitShifts);
    if (full.bitAnds != null) bag.bitAnds.push(full.bitAnds);
    if (full.bitOrs != null) bag.bitOrs.push(full.bitOrs);
    if (full.generations != null) bag.generations.push(full.generations);
    if (full.expandedNodes != null) bag.expandedNodes.push(full.expandedNodes);
    if (full.generatedNodes != null) bag.generatedNodes.push(full.generatedNodes);
    if (full.queuePushes != null) bag.queuePushes.push(full.queuePushes);
    if (full.queuePops != null) bag.queuePops.push(full.queuePops);
    if (full.roomsExpanded != null) bag.roomsExpanded.push(full.roomsExpanded);
    if (mazeIndex === 0 && i === repeats - 1) {
      bag.path = (full.path || prepared.referencePath || []).map((cell) => ({ ...cell }));
    }
    bag.searchMode = full.searchMode ?? bag.searchMode;
    bag.solver = full.solver || SOLVER_NAMES[id] || bag.solver;
    bag.visitedUnit = full.visitedUnit || full.expansionUnit || "cells";
    bag.pathLengthSource = full.pathLengthSource || (prepared.implicitOriginal ? "unique-tree-hops" : "reconstructed-cells");
    bag.quantized = Boolean(full.quantized);
    bag.raw.push({
      experimentId,
      mazeIndex,
      seed: mazeMeta?.seed ?? prepared.search.seed ?? null,
      mazeHash: meta.mazeHash,
      rows: prepared.search.rows,
      cols: prepared.search.cols,
      startRow: prepared.search.start.row,
      startCol: prepared.search.start.col,
      endRow: prepared.search.end.row,
      endCol: prepared.search.end.col,
      moveRule: MOVE_RULE,
      costModel: meta.costLabel,
      repeat: i,
      orderIndex,
      algorithm: id,
      solver: full.solver || SOLVER_NAMES[id] || null,
      searchMode: full.searchMode ?? null,
      implementationVersion: full.implementationVersion || IMPLEMENTATION_VERSION,
      metricsContract: full.metricsContract || METRICS_CONTRACT,
      oracleVersion: ORACLE_VERSION,
      warmupRuns,
      innerLoops: inner,
      searchTimeMs: searchMs,
      totalTimeMs: totalMs,
      clonePrepMs: (tPrep1 - tPrep0) / 1e6 / inner,
      pathReconstructionMs: full.pathReconstructionMs ?? null,
      expansionUnit: full.expansionUnit ?? null,
      discoveredCount: full.discoveredCount ?? null,
      expandedCount: full.expandedCount ?? null,
      generatedCount: full.generatedCount ?? null,
      reencounteredCount: full.reencounteredCount ?? null,
      legacyDiscoveredNodes: full.discoveredNodes ?? null,
      legacyExpandedNodes: full.expandedNodes ?? null,
      legacyGeneratedNodes: full.generatedNodes ?? null,
      pathLength: full.found ? full.pathLength : null,
      pathCost: full.found ? full.pathCost : null,
      referenceCost: evals.referenceCost,
      success: evals.success,
      terminationReason: full.terminationReason ?? null,
      pathValidityPassed: evals.pathValidityPassed,
      optimalityVerified: evals.optimalityVerified,
      optimalityStatus: evals.optimalityStatus,
      guaranteesOptimality: evals.guaranteesOptimality,
      reachabilityAgrees: evals.reachabilityAgrees,
      correct: evals.correct,
      warnings: warnings.join("; "),
    });
    warnings.forEach((text) => {
      if (!bag.warnings.includes(text)) bag.warnings.push(text);
    });
  };

  const setupMaze = (maze) => {
    const prepared = prepareExperimentMaze(maze);
    let reference = { status: "not-run", reachable: null, distance: prepared.referenceHops, cost: prepared.referenceHops, method: "virtual-tree" };
    let meta = { mazeHash: mazeContentHash(prepared.search), costLabel: "virtual" };
    if (!prepared.tooLarge) {
      reference = referenceSolve(prepared.search);
      const model = costModel(prepared.search);
      prepared.unevenWeight = !model.uniform;
      meta = {
        mazeHash: mazeContentHash(prepared.search),
        costLabel: model.uniform ? "unit" : `weighted[min=${model.minWeight},max=${model.maxWeight}${model.nonInteger ? ",non-integer" : ""}${model.negative ? ",negative" : ""}]`,
      };
    }
    algorithmIds.forEach((id) => {
      for (let w = 0; w < warmupRuns; w += 1) {
        runFresh(id, prepared, prepared.tooLarge ? null : cloneMaze(prepared.search), { skipPath: true });
      }
    });
    return { prepared, reference, meta };
  };

  const finish = (lastSetup) => buildReport(mazes, algorithmIds, repeats, bags, lastSetup, experimentId, warmupRuns);

  if (!yieldEachMaze) {
    let last = null;
    mazes.forEach((maze, mazeIndex) => {
      last = setupMaze(maze);
      for (let i = 0; i < repeats; i += 1) {
        shuffleSeeded(algorithmIds.slice(), shuffleSeed(maze, mazeIndex, i)).forEach((id, orderIndex) => {
          runMeasured(last, mazeIndex, id, i, orderIndex, maze);
        });
      }
    });
    return finish(last);
  }

  return (async () => {
    let last = null;
    for (let mazeIndex = 0; mazeIndex < mazes.length; mazeIndex += 1) {
      last = setupMaze(mazes[mazeIndex]);
      for (let i = 0; i < repeats; i += 1) {
        const order = shuffleSeeded(algorithmIds.slice(), shuffleSeed(mazes[mazeIndex], mazeIndex, i));
        for (let orderIndex = 0; orderIndex < order.length; orderIndex += 1) {
          runMeasured(last, mazeIndex, order[orderIndex], i, orderIndex, mazes[mazeIndex]);
          await new Promise((resolve) => (typeof window !== "undefined" ? window.setTimeout(resolve, 0) : setTimeout(resolve, 0)));
        }
      }
    }
    return finish(last);
  })();
}

function rate(list) {
  return list.length ? list.reduce((s, v) => s + v, 0) / list.length : null;
}

function buildReport(mazes, algorithmIds, repeats, bags, setup, experimentId, warmupRuns) {
  const first = mazes[0];
  const prepared = setup?.prepared;
  const reference = setup?.reference;
  const results = {};
  algorithmIds.forEach((id) => {
    const bag = bags[id];
    const time = summarize(bag.times);
    const totalTime = summarize(bag.totalTimes);
    const visited = summarize(bag.visited);
    const discovered = summarize(bag.discoveredNodes);
    const path = summarize(bag.pathLengths);
    const v2e = summarize(bag.v2Expanded);
    const v2d = summarize(bag.v2Discovered);
    const v2g = summarize(bag.v2Generated);
    const v2r = summarize(bag.v2Reencountered);
    const samples = bag.times.length;
    const pathValidityRate = rate(bag.pathValidity);
    const optimalityRate = rate(bag.optimality);
    const guaranteeRate = rate(bag.guarantees);
    const pathValidityPassed = pathValidityRate === 1 || (pathValidityRate == null && samples > 0);
    const optimalityVerified = optimalityRate === 1;
    const units = [...bag.expansionUnits];
    results[id] = {
      id,
      times: bag.times.slice(),
      raw: bag.raw.slice(),
      avgTimeMs: time.mean,
      avgSearchTimeMs: time.mean,
      avgTotalTimeMs: totalTime.mean,
      avgPathReconstructionMs: bag.pathMs.length ? summarize(bag.pathMs).mean : null,
      stdevTimeMs: time.stdev,
      medianTimeMs: time.median,
      p95TimeMs: time.p95,
      minTimeMs: time.min,
      maxTimeMs: time.max,
      avgVisited: visited.mean,
      avgDiscoveredNodes: discovered.mean,
      avgExpandedNodes: visited.mean,
      stdevVisited: visited.stdev,
      medianVisited: visited.median,
      p95Visited: visited.p95,
      minVisited: visited.min,
      maxVisited: visited.max,
      metricsContract: METRICS_CONTRACT,
      expansionUnit: units.length === 1 ? units[0] : units.join("|") || null,
      avgDiscoveredCount: v2d.mean,
      avgExpandedCount: v2e.mean,
      medianExpandedCount: v2e.median,
      p95ExpandedCount: v2e.p95,
      avgGeneratedCount: v2g.mean,
      avgReencounteredCount: v2r.mean,
      avgPathLength: bag.pathLengths.length ? path.mean : null,
      stdevPathLength: bag.pathLengths.length ? path.stdev : null,
      pathCost: bag.pathCosts.length ? summarize(bag.pathCosts).mean : null,
      found: bag.founds > 0,
      foundRate: samples ? bag.founds / samples : 0,
      pathValidityRate,
      pathValidityPassed,
      optimalityVerifiedRate: optimalityRate,
      optimalityVerified,
      guaranteesOptimality: guaranteeRate == null ? false : guaranteeRate === 1,
      guaranteeMixed: guaranteeRate != null && guaranteeRate > 0 && guaranteeRate < 1,
      guaranteeCondition: [...bag.guaranteeConditions].join(" / ") || null,
      correctRate: rate(bag.correct),
      optimalityStatusCounts: { ...bag.statusCounts },
      path: bag.path,
      visitedCount: visited.mean,
      pathLength: bag.pathLengths.length ? path.mean : null,
      heapPushes: bag.heapPushes.length ? summarize(bag.heapPushes).mean : null,
      heapPops: bag.heapPops.length ? summarize(bag.heapPops).mean : null,
      heuristicEvals: bag.heuristicEvals.length ? summarize(bag.heuristicEvals).mean : null,
      queueOps: bag.queueOps.length ? summarize(bag.queueOps).mean : null,
      peakFrontier: bag.peakFrontier.length ? summarize(bag.peakFrontier).mean : null,
      peakFrontierIsMean: true,
      confidenceEnd: bag.confidenceEnds.length ? summarize(bag.confidenceEnds).mean : null,
      discoveredCells: bag.discoveredCells.length ? summarize(bag.discoveredCells).mean : null,
      bitsetOperations: bag.bitsetOperations.length ? summarize(bag.bitsetOperations).mean : null,
      roomsExpanded: bag.roomsExpanded.length ? summarize(bag.roomsExpanded).mean : null,
      searchMode: bag.searchMode,
      solver: bag.solver,
      visitedUnit: bag.visitedUnit,
      pathLengthSource: bag.pathLengthSource,
      quantized: bag.quantized,
      sampleCount: samples,
      innerLoops: bag.innerLoops || 1,
      warmupRuns: bag.warmupRuns ?? warmupRuns,
      timeUnit: "ms",
      timingScope: TIMING_SCOPE,
      implementationVersion: IMPLEMENTATION_VERSION,
      measured: bag.measured !== false,
      verificationPassed: bag.measured !== false && pathValidityPassed,
      ci95TimeMs: time.ci95,
      bitShifts: bag.bitShifts.length ? summarize(bag.bitShifts).mean : null,
      bitAnds: bag.bitAnds.length ? summarize(bag.bitAnds).mean : null,
      bitOrs: bag.bitOrs.length ? summarize(bag.bitOrs).mean : null,
      generations: bag.generations.length ? summarize(bag.generations).mean : null,
      expandedNodes: bag.expandedNodes.length ? summarize(bag.expandedNodes).mean : null,
      generatedNodes: bag.generatedNodes.length ? summarize(bag.generatedNodes).mean : null,
      warnings: bag.warnings.slice(),
      energy: null,
    };
  });

  return {
    experimentId,
    createdAt: new Date().toISOString(),
    repeats,
    mazeCount: mazes.length,
    mazeSize: { rows: first.rows, cols: first.cols },
    start: { ...first.start },
    end: { ...first.end },
    seeds: mazes.map((m) => m.seed ?? null),
    algorithms: algorithmIds.slice(),
    virtualSearch: Boolean(first.virtual || prepared?.originalVirtual),
    implicitOriginal: Boolean(prepared?.implicitOriginal),
    exactPathLength: prepared?.tooLarge ? null : (reference?.distance ?? null),
    referencePathLength: prepared?.tooLarge ? null : (reference?.distance ?? null),
    referenceCost: prepared?.tooLarge ? null : (reference?.cost ?? null),
    referenceMethod: reference?.method ?? null,
    sameStart: true,
    sameEnd: true,
    moveRule: MOVE_RULE,
    timeUnit: "ms",
    timingScope: TIMING_SCOPE,
    implementationVersion: IMPLEMENTATION_VERSION,
    metricsContract: METRICS_CONTRACT,
    oracleVersion: ORACLE_VERSION,
    warmupRuns,
    results,
  };
}

function shuffleSeed(maze, mazeIndex, repeat) {
  return ((maze.seed ?? 20261005) + mazeIndex * 1009 + repeat * 17 + maze.rows * 13 + maze.cols) >>> 0;
}

function shuffleSeeded(items, seed) {
  let x = seed >>> 0 || 1;
  const rng = () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function summarize(values) {
  if (!values.length) {
    return { mean: null, stdev: null, median: null, p95: null, min: null, max: null, ci95: null, n: 0 };
  }
  const n = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n;
  const sampleVar = n > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    mean,
    stdev: Math.sqrt(variance),
    median: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    ci95: 1.96 * Math.sqrt(sampleVar / n),
    n,
  };
}

function quantile(sorted, p) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  const t = index - low;
  return sorted[low] * (1 - t) + sorted[high] * t;
}

export { getCell };