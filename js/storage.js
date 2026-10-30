const EXP_KEY = "graph-path-experiments";
const MAZE_KEY = "graph-path-mazes";

export function loadExperiments() {
  return read(EXP_KEY, []);
}

export function saveExperiment(record) {
  const list = loadExperiments();
  const results = {};
  Object.entries(record.results || {}).forEach(([id, r]) => {
    // 실행별 원시 기록(raw)은 localStorage 용량을 넘기기 쉬워 요약만 저장한다.
    const { raw, ...rest } = r;
    results[id] = { ...rest, rawRecordCount: Array.isArray(raw) ? raw.length : 0 };
  });
  const item = {
    id: record.id || `${Date.now()}`,
    ...record,
    results,
  };
  list.unshift(item);
  write(EXP_KEY, list.slice(0, 40));
  return item;
}

export function deleteExperiment(id) {
  write(EXP_KEY, loadExperiments().filter((item) => item.id !== id));
}

export function loadMazes() {
  return read(MAZE_KEY, []);
}

export function saveMaze(name, maze) {
  const list = loadMazes();
  const item = {
    id: `${Date.now()}`,
    name: name || `미로 ${list.length + 1}`,
    savedAt: new Date().toISOString(),
    maze,
  };
  list.unshift(item);
  write(MAZE_KEY, list.slice(0, 30));
  return item;
}

export function deleteMaze(id) {
  write(MAZE_KEY, loadMazes().filter((item) => item.id !== id));
}

export function experimentToCsv(record) {
  const header = [
    "savedAt",
    "repeats",
    "mazeCount",
    "sampleCount",
    "rows",
    "cols",
    "startRow",
    "startCol",
    "endRow",
    "endCol",
    "algorithm",
    "timeUnit",
    "avgSearchTimeMs",
    "avgTotalTimeMs",
    "avgTimeMs",
    "medianTimeMs",
    "p95TimeMs",
    "stdevTimeMs",
    "minTimeMs",
    "maxTimeMs",
    "visitedUnit",
    "avgDiscoveredNodes",
    "avgVisited",
    "medianVisited",
    "p95Visited",
    "stdevVisited",
    "bitsetOperations",
    "warnings",
    "avgPathLength",
    "stdevPathLength",
    "foundRate",
    "pathValidityRate",
    "optimalityVerifiedRate",
    "found",
    "heuristicEvals",
    "queueOps",
    "peakFrontier",
    "confidenceEnd",
    "searchMode",
    "quantized",
    "energy",
    "experimentId",
    "metricsContract",
    "implementationVersion",
    "oracleVersion",
    "moveRule",
    "warmupRuns",
    "innerLoops",
    "expansionUnit",
    "avgDiscoveredCount",
    "avgExpandedCount",
    "avgGeneratedCount",
    "avgReencounteredCount",
    "avgPathCost",
    "avgPathReconstructionMs",
    "guaranteesOptimality",
    "guaranteeCondition",
    "correctRate",
    "seeds",
  ];
  const csvCell = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll("\"", "\"\"")}"` : s;
  };
  const rows = record.algorithms.map((id) => {
    const r = record.results[id];
    return [
      record.createdAt,
      record.repeats,
      record.mazeCount || 1,
      r.sampleCount ?? "",
      record.mazeSize.rows,
      record.mazeSize.cols,
      record.start.row,
      record.start.col,
      record.end.row,
      record.end.col,
      id,
      r.timeUnit || "ms",
      formatNum(r.avgSearchTimeMs ?? r.avgTimeMs),
      formatNum(r.avgTotalTimeMs),
      formatNum(r.avgTimeMs),
      formatNum(r.medianTimeMs),
      formatNum(r.p95TimeMs),
      formatNum(r.stdevTimeMs),
      formatNum(r.minTimeMs),
      formatNum(r.maxTimeMs),
      r.visitedUnit ?? "",
      formatNum(r.avgDiscoveredNodes),
      formatNum(r.avgVisited),
      formatNum(r.medianVisited),
      formatNum(r.p95Visited),
      formatNum(r.stdevVisited),
      r.bitsetOperations ?? "",
      (r.warnings || []).join(";"),
      r.measured === false || r.pathLengthSource === "unique-tree-hops"
        ? ""
        : formatNum(r.avgPathLength),
      formatNum(r.stdevPathLength),
      r.foundRate ?? "",
      r.pathValidityRate ?? "",
      r.optimalityVerifiedRate ?? "",
      r.found,
      r.heuristicEvals ?? "",
      r.queueOps ?? "",
      r.peakFrontier ?? "",
      r.confidenceEnd ?? "",
      r.searchMode ?? "",
      r.quantized ?? "",
      r.energy ?? "not_measured_in_browser",
      record.experimentId ?? record.id ?? "",
      r.metricsContract ?? "legacy-v1",
      r.implementationVersion ?? "",
      record.oracleVersion ?? "",
      record.moveRule ?? "4-connected",
      r.warmupRuns ?? "",
      r.innerLoops ?? "",
      r.expansionUnit ?? r.visitedUnit ?? "",
      formatNum(r.avgDiscoveredCount),
      formatNum(r.avgExpandedCount),
      formatNum(r.avgGeneratedCount),
      formatNum(r.avgReencounteredCount),
      formatNum(r.pathCost),
      formatNum(r.avgPathReconstructionMs),
      r.guaranteesOptimality ?? "",
      r.guaranteeCondition ?? "",
      r.correctRate ?? "",
      (record.seeds || []).join(";"),
    ].map(csvCell).join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("localStorage 저장 실패:", error);
    throw new Error("브라우저 저장 공간이 부족해 저장하지 못했습니다. 오래된 실험을 지우고 다시 시도하세요.");
  }
}

function formatNum(n) {
  if (n == null || Number.isNaN(Number(n))) return "";
  return Number(n).toFixed(4);
}
