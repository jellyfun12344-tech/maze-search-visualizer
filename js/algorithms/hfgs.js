import { cellKey, getWeight, manhattan, neighbors, sameCell } from "../maze.js";
import { finishResult, validateSearchInput } from "./common.js";

const STRATEGIES = ["dfs", "bfs", "greedy", "astar"];
/**
 * HFGS-safe의 전략 목록. 둘 다 닫힌 칸의 g가 최소라는 성질을 지킨다.
 * bfs = g가 가장 작은 칸(Dijkstra 순서), astar = g + 맨해튼이 가장 작은 칸.
 * dfs·greedy는 g가 최소가 아닌 칸을 닫을 수 있고, 닫힌 칸은 다시 열지 않으므로 뺐다.
 */
export const SAFE_STRATEGIES = ["bfs", "astar"];
const DEFAULT_WINDOW = 64;
const DEFAULT_PROBE = 24;
const SWITCH_MARGIN = 1.08;

/**
 * HFGS — Hardware-Feedback Graph Search (브라우저 프로토타입)
 *
 * 그래프 크기나 고정 순서로 알고리즘을 고르지 않는다.
 * measurement window마다 wall-clock과 탐색 통계를 보고,
 * 성능이 나빠지면 같은 상태에서 짧은 probe로 지금 빠른 전략을 고른다.
 *
 * 브라우저에서는 CPU cycle / cache miss를 읽을 수 없다.
 * 없는 값은 만들지 않고 hardware_backend = unavailable 로 기록한다.
 */
export function runHFGS(maze, options = {}) {
  return runHFGSCore(maze, {
    windowSize: options.windowSize ?? DEFAULT_WINDOW,
    probeBudget: options.probeBudget ?? DEFAULT_PROBE,
    useProbe: options.useProbe !== false,
    useRuntimeFeedback: options.useRuntimeFeedback !== false,
    useSearchFeedback: options.useSearchFeedback !== false,
    recordSteps: Boolean(options.recordSteps),
    skipPath: Boolean(options.skipPath),
    strategies: Array.isArray(options.strategies) && options.strategies.length ? options.strategies.slice() : STRATEGIES,
    clock: typeof options.clock === "function" ? options.clock : null,
    solver: options.solverName || "hfgs.js::runHFGS",
    searchMode: options.searchModeName || "hfgs",
  });
}

/**
 * HFGS-safe: HFGS와 같은 window·probe·전환 규칙이지만 전략은 SAFE_STRATEGIES만 쓴다.
 * 기본 HFGS를 대신하지 않는 별도 모드다. 결과 표에 HFGS-safe로 따로 나온다.
 */
export function runHFGSSafe(maze, options = {}) {
  return runHFGS(maze, {
    ...options,
    strategies: SAFE_STRATEGIES,
    solverName: "hfgs.js::runHFGSSafe",
    searchModeName: "hfgs-safe",
  });
}

export function runHFGSNoProbe(maze, options = {}) {
  return runHFGS(maze, { ...options, useProbe: false });
}

export function runHFGSRuntimeOnly(maze, options = {}) {
  return runHFGS(maze, { ...options, useRuntimeFeedback: true, useSearchFeedback: false });
}

export function runHFGSSearchOnly(maze, options = {}) {
  return runHFGS(maze, { ...options, useRuntimeFeedback: false, useSearchFeedback: true });
}

function runHFGSCore(maze, cfg) {
  const invalid = validateSearchInput(maze, cfg.solver);
  if (invalid) return invalid;

  const state = createState(maze);
  const log = [];
  const steps = cfg.recordSteps ? [] : null;
  const strategies = cfg.strategies;
  let strategy = strategies.includes("bfs") ? "bfs" : strategies[0];
  let switches = 0;
  let probeCostMs = 0;
  let probes = 0;
  let probeExpansions = 0;
  let found = false;
  let windows = 0;
  const history = [];
  const now = cfg.clock || (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));

  while (!found && hasOpen(state)) {
    const before = snapshotSearch(state, maze);
    const t0 = now();
    const expanded = expandWindow(state, maze, strategy, cfg.windowSize, steps);
    const wallMs = now() - t0;
    windows += 1;
    const after = snapshotSearch(state, maze);
    const nps = wallMs > 0 ? (expanded / wallMs) * 1000 : expanded * 1e6;
    const windowRec = {
      window: windows,
      strategy,
      expansions: expanded,
      wall_time_us: wallMs * 1000,
      nodes_per_sec: nps,
      frontier_size: after.frontier,
      expanded_total: state.closed.size,
      progress: after.bestH,
      duplicate_ratio: after.duplicates / Math.max(1, expanded),
      branch_factor: after.branch,
      cache_miss_rate: "unavailable",
      branch_miss_rate: "unavailable",
      hardware_backend: "unavailable",
      cpu_utilization: "unavailable",
    };

    if (sameCell(state.last, maze.end)) {
      found = true;
      windowRec.decision = "FOUND";
      log.push(windowRec);
      break;
    }

    history.push({
      nps,
      wallMs,
      frontier: after.frontier,
      progress: before.bestH - after.bestH,
      strategy,
    });

    let decision = "KEEP";
    if (shouldConsiderChange(history, cfg)) {
      if (cfg.useProbe) {
        const tProbe = now();
        const probe = runProbe(state, maze, cfg.probeBudget, strategies, now);
        probeCostMs += now() - tProbe;
        probes += 1;
        probeExpansions += probe.__expansions || 0;
        delete probe.__expansions;
        windowRec.probe = probe;
        const best = pickBestProbe(probe, strategy, strategies);
        if (best && best !== strategy && probe[best] >= (probe[strategy] || 0) * SWITCH_MARGIN) {
          strategy = best;
          switches += 1;
          decision = `SWITCH:${best}`;
        } else {
          decision = `PROBE_KEEP:${strategy}`;
        }
      } else {
        const next = nextStrategy(strategy, strategies);
        strategy = next;
        switches += 1;
        decision = `SWITCH_NO_PROBE:${next}`;
      }
    }
    windowRec.decision = decision;
    log.push(windowRec);

    if (cfg.recordSteps && steps) {
      steps.push({
        current: state.last ? { ...state.last } : { ...maze.start },
        visitedAdd: state.last ? { ...state.last } : null,
        frontier: listOpen(state, 40),
        event: decision.startsWith("SWITCH") ? "shift" : "visit",
        scores: state.last ? scoresOf(state, state.last, maze) : null,
        strategy,
        reason: hfgsReason(windowRec),
        detail: hfgsDetail(windowRec, cfg),
      });
    }
  }

  const extras = {
    searchMode: cfg.searchMode,
    solver: cfg.solver,
    strategies: strategies.slice(),
    deterministicClock: Boolean(cfg.clock),
    heuristicEvals: state.heuristicEvals,
    queueOps: state.queueOps,
    peakFrontier: state.peakFrontier,
    skipPath: cfg.skipPath,
    strategySwitches: switches,
    probeCount: probes,
    probeCostMs,
    probeExpansions,
    windowCount: windows,
    hardwareBackend: "unavailable",
    hfgsLog: log,
    energy: null,
    discoveredNodes: state.g.size,
    generatedNodes: state.generatedCount,
    v2: {
      discoveredCount: state.g.size,
      expandedCount: state.expandedCount,
      generatedCount: state.generatedCount,
      reencounteredCount: state.reencountered,
      improvedCount: state.improved,
      expansionUnit: "cells",
    },
  };
  return finishResult(maze, state.closed, state.parent, found, steps, extras);
}

function createState(maze) {
  const startKey = cellKey(maze.start.row, maze.start.col);
  const open = [{ row: maze.start.row, col: maze.start.col, seq: 0 }];
  return {
    maze,
    open,
    closed: new Set(),
    g: new Map([[startKey, 0]]),
    parent: new Map(),
    seq: 1,
    last: null,
    heuristicEvals: 1,
    queueOps: 1,
    peakFrontier: 1,
    duplicates: 0,
    expandedCount: 0,
    generatedCount: 0,
    reencountered: 0,
    improved: 0,
  };
}

function cloneState(state) {
  return {
    maze: state.maze,
    open: state.open.map((n) => ({ ...n })),
    closed: new Set(state.closed),
    g: new Map(state.g),
    parent: new Map(state.parent),
    seq: state.seq,
    last: state.last ? { ...state.last } : null,
    heuristicEvals: state.heuristicEvals,
    queueOps: state.queueOps,
    peakFrontier: state.peakFrontier,
    duplicates: 0,
    expandedCount: 0,
    generatedCount: 0,
    reencountered: 0,
    improved: 0,
  };
}

function hasOpen(state) {
  return state.open.some((n) => !state.closed.has(cellKey(n.row, n.col)));
}

function expandWindow(state, maze, strategy, budget, steps) {
  let expanded = 0;
  let generated = 0;
  while (expanded < budget && hasOpen(state)) {
    const current = pick(state, maze, strategy);
    if (!current) break;
    const key = cellKey(current.row, current.col);
    if (state.closed.has(key)) {
      state.duplicates += 1;
      continue;
    }
    state.closed.add(key);
    state.last = { row: current.row, col: current.col };
    expanded += 1;
    if (steps && expanded === 1) {
      steps.push({
        current: { row: current.row, col: current.col },
        visitedAdd: { row: current.row, col: current.col },
        frontier: listOpen(state, 40),
        event: sameCell(current, maze.start) ? "start" : "visit",
        scores: scoresOf(state, current, maze),
        strategy,
        reason: `HFGS가 ${label(strategy)} 정책으로 이 칸을 확장합니다.`,
        detail: "정책은 그래프 크기가 아니라, 직전 window의 실제 처리량과 탐색 통계를 보고 고릅니다.",
      });
    }
    if (sameCell(current, maze.end)) break;
    state.expandedCount += 1;
    const gCur = state.g.get(key) ?? 0;
    for (const next of neighbors(maze, current.row, current.col)) {
      state.generatedCount += 1;
      const nextKey = cellKey(next.row, next.col);
      const seen = state.g.has(nextKey);
      if (seen) state.reencountered += 1;
      if (state.closed.has(nextKey)) continue;
      const ng = gCur + getWeight(maze, next.row, next.col);
      if (ng >= (state.g.get(nextKey) ?? Infinity)) continue;
      if (seen) state.improved += 1;
      state.g.set(nextKey, ng);
      state.parent.set(nextKey, key);
      state.open.push({ row: next.row, col: next.col, seq: state.seq });
      state.seq += 1;
      state.queueOps += 1;
      generated += 1;
    }
    state.peakFrontier = Math.max(state.peakFrontier, state.open.length);
  }
  state.lastBranch = generated / Math.max(1, expanded);
  return expanded;
}

function pick(state, maze, strategy) {
  let bestI = -1;
  let best = null;
  for (let i = 0; i < state.open.length; i += 1) {
    const n = state.open[i];
    const key = cellKey(n.row, n.col);
    if (state.closed.has(key)) continue;
    if (!best) {
      best = n;
      bestI = i;
      continue;
    }
    if (better(n, best, strategy, state, maze)) {
      best = n;
      bestI = i;
    }
  }
  if (bestI < 0) return null;
  state.open.splice(bestI, 1);
  state.queueOps += 1;
  return best;
}

function better(a, b, strategy, state, maze) {
  const ga = state.g.get(cellKey(a.row, a.col)) ?? Infinity;
  const gb = state.g.get(cellKey(b.row, b.col)) ?? Infinity;
  const ha = hOf(state, a, maze);
  const hb = hOf(state, b, maze);
  if (strategy === "dfs") return a.seq > b.seq;
  if (strategy === "bfs") return ga < gb || (ga === gb && a.seq < b.seq);
  if (strategy === "greedy") return ha < hb || (ha === hb && ga < gb);
  return ga + ha < gb + hb || (ga + ha === gb + hb && ha < hb);
}

function hOf(state, cell, maze) {
  state.heuristicEvals += 1;
  return manhattan(cell, maze.end);
}

function snapshotSearch(state, maze) {
  let frontier = 0;
  let bestH = Infinity;
  for (const n of state.open) {
    if (state.closed.has(cellKey(n.row, n.col))) continue;
    frontier += 1;
    bestH = Math.min(bestH, manhattan(n, maze.end));
  }
  if (!Number.isFinite(bestH) && state.last) bestH = manhattan(state.last, maze.end);
  return {
    frontier,
    bestH: Number.isFinite(bestH) ? bestH : 0,
    duplicates: state.duplicates,
    branch: state.lastBranch || 0,
  };
}

function listOpen(state, limit) {
  const cells = [];
  for (const n of state.open) {
    if (state.closed.has(cellKey(n.row, n.col))) continue;
    cells.push({ row: n.row, col: n.col });
    if (cells.length >= limit) break;
  }
  return cells;
}

function scoresOf(state, cell, maze) {
  const g = state.g.get(cellKey(cell.row, cell.col)) ?? 0;
  const h = manhattan(cell, maze.end);
  return { g, h, f: g + h };
}

function shouldConsiderChange(history, cfg) {
  if (history.length < 3) return false;
  const a = history[history.length - 3];
  const b = history[history.length - 2];
  const c = history[history.length - 1];
  const runtimeWorse = cfg.useRuntimeFeedback && c.nps < b.nps && b.nps < a.nps && c.wallMs > a.wallMs;
  const searchWorse = cfg.useSearchFeedback && c.frontier > a.frontier && c.progress <= 0;
  if (cfg.useRuntimeFeedback && cfg.useSearchFeedback) return runtimeWorse && searchWorse;
  if (cfg.useRuntimeFeedback) return runtimeWorse;
  if (cfg.useSearchFeedback) return searchWorse;
  return false;
}

function runProbe(state, maze, budget, strategies, now) {
  const result = {};
  let total = 0;
  for (const name of strategies) {
    const copy = cloneState(state);
    const t0 = now();
    const expanded = expandWindow(copy, maze, name, budget, null);
    const dt = now() - t0;
    total += expanded;
    result[name] = dt > 0 ? (expanded / dt) * 1000 : expanded * 1e6;
  }
  result.__expansions = total;
  return result;
}

function pickBestProbe(probe, current, strategies) {
  let best = current;
  let bestV = probe[current] ?? 0;
  strategies.forEach((name) => {
    if ((probe[name] ?? 0) > bestV) {
      best = name;
      bestV = probe[name];
    }
  });
  return best;
}

function nextStrategy(current, strategies) {
  const i = strategies.indexOf(current);
  return strategies[(i + 1) % strategies.length];
}

function label(name) {
  return { dfs: "DFS", bfs: "BFS", greedy: "Greedy", astar: "A*" }[name] || name;
}

function hfgsReason(rec) {
  return `window ${rec.window}: ${label(rec.strategy)} · ${rec.expansions}칸 · ${(rec.nodes_per_sec / 1000).toFixed(1)}k nodes/s · ${rec.decision}`;
}

function hfgsDetail(rec) {
  return [
    `1차 목표는 wall-clock이다. 이 window는 ${rec.wall_time_us.toFixed(1)}µs, 프론티어 ${rec.frontier_size}칸.`,
    `cache_miss_rate=${rec.cache_miss_rate}, hardware_backend=${rec.hardware_backend}. 없는 값은 만들지 않았다.`,
    rec.probe
      ? `probe 처리량(nodes/s): ${STRATEGIES.map((s) => `${label(s)}=${Math.round(rec.probe[s])}`).join(", ")}`
      : "이번 window에서는 probe를 하지 않았다.",
  ].join(" ");
}
