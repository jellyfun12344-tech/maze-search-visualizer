import {
  ALGO_META,
  LEARN_MAZES,
  SIZE_PRESETS,
  clampMazeShape,
  cloneMaze,
  deserializeMaze,
  formatMazeDim,
  generateRandomMaze,
  clearMaze,
  isVirtualMaze,
  resizeMaze,
  mazeFingerprint,
  virtualMazeFacts,
} from "./maze.js";
import { MazeVisualizer, Playback } from "./visualizer.js";
import { RUNNERS, runAlgorithm, benchmarkBatch, certifyAlgorithmRun, TIMING_SCOPE } from "./experiment.js";
import {
  buildResultRow,
  EXPANSION_UNIT_LABELS,
  formatCell,
  illegalPathLength,
  TABLE_COLUMNS,
  tableCells,
} from "./result-schema.js";
import {
  loadExperiments,
  saveExperiment,
  deleteExperiment,
  loadMazes,
  saveMaze,
  deleteMaze,
  experimentToCsv,
  downloadCsv,
} from "./storage.js";

const QUIZZES = {
  dfs: {
    question: "DFS는 어떤 방식으로 탐색할까요?",
    options: [
      "가장 가까운 칸부터 차례대로",
      "한 길을 끝까지 간 뒤, 막히면 돌아온다",
      "비용이 가장 높은 칸부터",
      "무작위로 칸을 고른다",
    ],
    answer: 1,
    explanation: "DFS는 스택을 사용합니다. 한 방향으로 깊게 들어가고, 더 이상 갈 수 없으면 이전 갈림길로 백트래킹합니다.",
  },
  bfs: {
    question: "BFS는 어떤 방식으로 탐색할까요?",
    options: [
      "가장 깊은 곳부터",
      "가까운 곳부터",
      "비용이 가장 높은 곳부터",
      "무작위로",
    ],
    answer: 1,
    explanation: "BFS는 큐를 사용해 시작점에서 같은 거리에 있는 칸을 먼저 봅니다. 모든 이동 비용이 같으면 최단 경로를 찾습니다.",
  },
  dijkstra: {
    question: "Dijkstra가 다음 칸을 고르는 기준은 무엇일까요?",
    options: [
      "목표에서 가장 가까운 칸",
      "지금까지 이동하는 데 든 실제 비용이 가장 작은 칸",
      "아직 방문하지 않은 아무 칸",
      "벽이 가장 많은 방향",
    ],
    answer: 1,
    explanation: "Dijkstra는 시작점에서 현재까지 누적된 실제 이동 비용이 가장 작은 칸을 고릅니다. 앞으로 남은 거리는 보지 않습니다.",
  },
  astar: {
    question: "A*의 f(n)은 무엇일까요?",
    options: [
      "무작위로 정한 점수",
      "지금까지의 실제 비용 g(n)과 목표까지 예상 비용 h(n)의 합",
      "방문한 칸의 개수",
      "벽의 개수",
    ],
    answer: 1,
    explanation: "f(n) = g(n) + h(n)입니다. g는 지금까지 실제로 든 비용, h는 목표까지 남은 거리의 예상값입니다. 이 사이트에서는 맨해튼 거리를 사용합니다.",
  },
  aefs: {
    question: "AEFS가 탐색 전략을 바꾸는 기준은 무엇일까요?",
    options: [
      "항상 A*만 사용한다",
      "지금까지의 탐색 증거가 휴리스틱을 얼마나 믿을 수 있는지(C)",
      "무작위로 BFS와 DFS를 고른다",
      "벽을 만날 때마다 미로를 다시 만든다",
    ],
    answer: 1,
    explanation: "AEFS는 신뢰도 C를 갱신합니다. C가 낮으면 BFS처럼 넓게 보고, C가 높으면 목표 방향으로 집중합니다. 항상 더 빠르다고 가정하지 않습니다.",
  },
  aefsq: {
    question: "AEFS-Q의 양자화가 의미하는 것은 무엇일까요?",
    options: [
      "양자 컴퓨터에서 실행한다",
      "비슷한 우선순위 값을 같은 버킷으로 묶어 관리 비용을 줄이려 한다",
      "경로를 무조건 짧게 만든다",
      "벽을 지울 수 있게 한다",
    ],
    answer: 1,
    explanation: "여기서 양자화는 양자컴퓨터가 아닙니다. 비슷한 f(n)을 한 버킷에 모아 우선순위 큐 대신 버킷 프론티어를 쓰는 고전적인 방법입니다.",
  },
  greedy: {
    question: "Greedy Best-First는 무엇을 보고 다음 칸을 고를까요?",
    options: [
      "지금까지의 실제 비용 g만",
      "목표까지 예상 거리 h만",
      "스택의 가장 아래 칸",
      "무작위로",
    ],
    answer: 1,
    explanation: "Greedy는 h(n)만 봅니다. 목표 쪽으로 빨리 갈 수는 있지만 최단 경로는 보장하지 않습니다.",
  },
  hfgs: {
    question: "HFGS가 탐색 전략을 바꾸는 근거는 무엇일까요?",
    options: [
      "그래프가 작으면 DFS, 크면 BFS로 미리 정한다",
      "탐색 도중 실제 실행시간과 탐색 통계를 재고, 필요하면 짧게 시험(probe)해 본다",
      "항상 A*가 가장 빠르다고 가정한다",
      "CPU 사용률이 80%를 넘으면 무조건 DFS로 바꾼다",
    ],
    answer: 1,
    explanation: "HFGS는 시작 전에 알고리즘을 고르지 않습니다. window마다 wall-clock과 탐색 상태를 보고, 성능이 나빠지면 같은 상태에서 짧게 probe한 뒤 지금 더 빠른 정책을 유지합니다.",
  },
  pair: {
    question: "칸을 옮기는 비용이 모두 1일 때, PAIR가 만난 길이 최단인 이유는 무엇일까요?",
    options: [
      "시작과 목표에서 가까운 칸부터 퍼지다가 두 탐색이 맞닿기 때문이다",
      "벽이 많은 칸을 무조건 건너뛰기 때문이다",
      "목표 방향을 한 번만 보고 끝까지 직진하기 때문이다",
      "방문한 칸을 무작위 순서로 고르기 때문이다",
    ],
    answer: 0,
    explanation: "비용이 1이면 먼저 만나는 연결의 거리 합이 가장 짧습니다. 칸 비용이 서로 다르면 양방향 규칙 대신 A*가 g + 맨해튼이 가장 작은 칸을 확정합니다.",
  },
  tier: {
    question: "TIER에서 비용이 모두 1일 때, 세대 번호가 최단 거리인 이유는 무엇일까요?",
    options: [
      "한 세대에 이미 도달한 칸의 이웃 한 칸만 새로 켜기 때문이다",
      "벽이 많은 칸을 경계 줄에서 건너뛰기 때문이다",
      "복도를 갈림길 하나로 접기 때문이다",
      "목표 방향의 칸만 남기기 때문이다",
    ],
    answer: 0,
    explanation: "각 세대는 바로 이전 세대의 위·아래·왼쪽·오른쪽만 켭니다. 그래서 세대 번호는 걸음 수와 같고, 목표 비트가 켜진 세대가 최단 거리입니다. 비용이 1이 아니면 이 비트 규칙 대신 비용 버킷을 씁니다.",
  },
  bpbfs: {
    question: "BP-BFS가 보통 BFS와 같은 최단 거리를 내는 이유는 무엇일까요?",
    options: [
      "한 세대에 바로 옆 칸만 켜므로, 세대 번호가 걸음 수와 같기 때문이다",
      "벽이 많은 칸을 건너뛰기 때문이다",
      "시작과 목표에서 동시에 퍼지기 때문이다",
      "목표 방향의 칸만 남기기 때문이다",
    ],
    answer: 0,
    explanation: "BP-BFS는 큐 대신 비트판을 쓰지만, 한 세대는 이전 세대의 이웃만 켭니다. 그래서 보통 BFS와 같은 물결입니다. TIER처럼 양쪽에서 만나지는 않습니다. 칸 비용이 1이 아니면 이 비트 규칙 대신 보통 BFS를 씁니다.",
  },
  rim: {
    question: "RIM은 경계에 있는 다음 칸을 어떻게 고를까요?",
    options: [
      "방금 칸에 붙은 벽의 수만큼 경계 줄에서 건너뛴다",
      "목표까지 예상 거리가 가장 짧은 칸을 고른다",
      "복도를 한 칸으로 접어서 갈림길만 고른다",
      "항상 왼쪽 벽만 따라간다",
    ],
    answer: 0,
    explanation: "RIM은 탐색한 구역 바로 바깥의 칸들을 한 줄로 두고, 보폭을 1 + 벽 개수로 정합니다. 최단 경로를 보장하지 않습니다.",
  },
  sley: {
    question: "SLEY가 목표를 처음 집었을 때 그 비용이 최단인 이유는 무엇일까요?",
    options: [
      "더 싼 비용 층의 구슬을 이미 다 집은 뒤에야 지금 층에서 고르기 때문이다",
      "벽이 많은 칸을 무조건 건너뛰기 때문이다",
      "한 행의 비트를 한꺼번에 밀기 때문이다",
      "목표 방향만 보기 때문이다",
    ],
    answer: 0,
    explanation: "SLEY는 북으로 열을 고르지만, 집을 수 있는 구슬은 지금 가장 싼 비용 층의 것뿐입니다. 음수 비용이 없으면 목표를 처음 집는 순간의 비용이 최단입니다.",
  },
  jps4: {
    question: "JPS4가 복도 중간 칸을 건너뛰어도 최단 거리가 되는 이유는 무엇일까요?",
    options: [
      "비용이 모두 1이면 직선 위의 중간 칸은 우회를 만들지 않고, 강제 이웃이 있는 칸에서만 방향을 바꾸기 때문이다",
      "벽을 지울 수 있기 때문이다",
      "목표 방향만 보고 대각선으로 가기 때문이다",
      "방문한 칸을 무작위 순서로 고르기 때문이다",
    ],
    answer: 0,
    explanation: "칸 비용이 모두 1이면 직선 복도를 끝까지 가는 것과 중간을 건너뛰는 것의 걸음 수가 같습니다. 옆길이 열리는 강제 이웃이나 목표에서만 멈추므로, 점프 지점을 A*로 이으면 BFS와 같은 최단 거리가 됩니다. 비용이 1이 아니면 이 점프는 쓰지 않고 A*로 바꿉니다.",
  },
};

const EVENT_LABELS = {
  start: "시작",
  visit: "탐색",
  backtrack: "백트래킹",
  complete: "완료",
  shift: "전략 전환",
};

export function createApp() {
  const views = {
    home: document.getElementById("view-home"),
    learn: document.getElementById("view-learn"),
    experiment: document.getElementById("view-experiment"),
  };

  const learnCanvas = document.getElementById("learn-canvas");
  const experimentCanvas = document.getElementById("experiment-canvas");
  const learnViz = new MazeVisualizer(learnCanvas);
  const expViz = new MazeVisualizer(experimentCanvas, {
    editable: true,
    onChange: () => {
      state.expOverlay = null;
      updateMazeSizeLabel();
    },
  });

  const playback = new Playback(learnViz, {
    onStep: handleLearnStep,
    onDone: handleLearnDone,
  });

    const charts = { time: null, visited: null, path: null, heuristic: null };

  const state = {
    view: "home",
    learnAlgo: "dfs",
    learnResult: null,
    learnFinished: false,
    experimentMaze: generateRandomMaze(21, 21, { multiPath: true }),
    repeats: 5,
    mazeCount: 1,
    lastBenchmark: null,
    expOverlay: null,
  };

  expViz.setMaze(state.experimentMaze);
  bindNavigation();
  bindLearn();
  bindExperiment();
  refreshSavedMazes();
  refreshHistory();
  showView("home");
  selfCheck();

  function bindNavigation() {
    document.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", () => showView(el.dataset.nav));
    });
    document.querySelectorAll("[data-learn-algo]").forEach((el) => {
      el.addEventListener("click", () => {
        showView("learn");
        selectLearnAlgo(el.dataset.learnAlgo);
      });
    });
  }

  function showView(name) {
    state.view = name;
    Object.entries(views).forEach(([key, el]) => {
      const active = key === name;
      el.classList.toggle("is-active", active);
      el.hidden = !active;
    });
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.classList.toggle("is-active", link.dataset.nav === name);
    });
    if (name === "learn") {
      selectLearnAlgo(state.learnAlgo);
      requestAnimationFrame(() => learnViz.resize());
    }
    if (name === "experiment") {
      expViz.setMaze(state.experimentMaze);
      requestAnimationFrame(() => expViz.resize());
    }
  }

  function bindLearn() {
    document.querySelectorAll("[data-learn-tab]").forEach((tab) => {
      tab.addEventListener("click", () => selectLearnAlgo(tab.dataset.learnTab));
    });
    document.getElementById("btn-play").addEventListener("click", () => {
      hideLearnComplete();
      playback.play();
    });
    document.getElementById("btn-pause").addEventListener("click", () => playback.pause());
    document.getElementById("btn-step").addEventListener("click", () => {
      hideLearnComplete();
      playback.pause();
      playback.stepOnce();
    });
    document.getElementById("btn-reset").addEventListener("click", () => {
      hideLearnComplete();
      playback.reset();
      resetLearnPanel();
    });
    document.getElementById("learn-speed").addEventListener("input", (event) => {
      playback.setDelay(speedToDelay(Number(event.target.value)));
    });
    document.getElementById("btn-why").addEventListener("click", () => {
      const box = document.getElementById("learn-why");
      box.hidden = !box.hidden;
    });
    playback.setDelay(speedToDelay(Number(document.getElementById("learn-speed").value)));
  }

  function selectLearnAlgo(id) {
    state.learnAlgo = id;
    state.learnFinished = false;
    document.querySelectorAll("[data-learn-tab]").forEach((tab) => {
      const active = tab.dataset.learnTab === id;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    const meta = ALGO_META[id];
    document.getElementById("learn-analogy").textContent = meta.analogy;
    document.getElementById("learn-algo-name").textContent = meta.name;
    const tag = document.getElementById("learn-algo-tag");
    tag.textContent = meta.short;
    tag.className = `algo-tag algo-tag-${id}`;
    document.getElementById("learn-scores").hidden = !["astar", "dijkstra", "aefs", "aefsq", "greedy", "hfgs", "pair", "sley", "jps4"].includes(id);
    document.getElementById("learn-confidence").hidden = id !== "aefs" && id !== "aefsq";
    document.getElementById("learn-maze-hint").textContent =
      id === "dijkstra"
        ? "노란 칸은 이동 비용 5 · Dijkstra는 싼 길을 고릅니다"
        : id === "aefs" || id === "aefsq"
          ? "C가 낮으면 넓게, 높으면 목표 쪽으로 탐색합니다"
          : id === "hfgs" || id === "hfgsnp" || id === "hfgsrt" || id === "hfgsse"
            ? "브라우저에서는 하드웨어 카운터를 읽지 못합니다. wall-clock과 탐색 통계만 사용합니다"
            : id === "rim"
              ? "경계 줄을 벽 개수만큼 건너뜁니다. 최단 경로는 보장하지 않습니다"
              : id === "pair"
                ? "비용이 모두 1이면 양쪽에서 만나고, 비용이 다르면 A*로 최단 비용을 찾습니다"
                : id === "tier"
                  ? "각 행을 비트로 묶어 한 세대에 한 칸씩 민다. 비용이 1이면 세대 수가 최단 거리다"
                  : id === "bpbfs"
                    ? "한쪽에서만 비트를 민다. TIER와 달리 양방향이 아니다. 비용이 1이면 세대 수가 최단 거리다"
                    : id === "sley"
                      ? "같은 비용 층의 구슬만 열 막대에 두고 북이 집습니다. 목표를 처음 집으면 그 비용이 최단입니다"
                      : id === "jps4"
                        ? "직선 복도는 건너뛰고 점프 지점만 엽니다. 비용이 모두 1이면 BFS와 같은 최단 거리입니다. 비용이 다르면 A*로 바꿉니다"
                        : "그래프: 칸 = 정점, 인접한 칸 = 간선";

    const maze = cloneMaze(LEARN_MAZES[id]);
    learnViz.setMaze(maze);
    const result = runAlgorithm(id, maze, { recordSteps: true });
    state.learnResult = result;
    state.learnCertificate = certifyAlgorithmRun(id, maze, result);
    playback.load(result);
    resetLearnPanel();
    hideLearnComplete();
    renderQuiz(id);
  }

  function resetLearnPanel() {
    document.getElementById("learn-event").textContent = "준비";
    document.getElementById("learn-reason").textContent =
      "재생을 누르면 시작점에서 탐색을 시작합니다. 한 단계씩 보면 알고리즘이 칸을 고르는 순서가 더 잘 보입니다.";
    document.getElementById("learn-why").hidden = true;
    document.getElementById("learn-why").textContent =
      "아직 탐색이 시작되지 않았습니다. 한 단계를 진행한 뒤 다시 눌러 보세요.";
    document.getElementById("learn-visited-count").textContent = "0";
    document.getElementById("learn-frontier-count").textContent = "0";
    updateProgress(-1, state.learnResult?.steps.length || 0);
    setScores(null, null);
  }

  function handleLearnStep(index, total, step) {
    updateProgress(index, total);
    if (!step) return;
    document.getElementById("learn-event").textContent = EVENT_LABELS[step.event] || "탐색";
    document.getElementById("learn-reason").textContent = step.reason;
    document.getElementById("learn-why").textContent = step.detail || step.reason;
    document.getElementById("learn-visited-count").textContent = String(playback.visited.length);
    document.getElementById("learn-frontier-count").textContent = String((step.frontier || []).length);
    setScores(step.scores, step.strategy);
  }

  function handleLearnDone() {
    if (state.learnFinished || !state.learnResult) return;
    state.learnFinished = true;
    const result = state.learnResult;
    const card = document.getElementById("learn-complete");
    card.hidden = false;
    document.getElementById("learn-complete-text").textContent = result.found
      ? "목표까지 가는 경로를 찾았습니다. 아래 숫자는 이 예제 미로에서 실제로 측정한 값입니다."
      : "이 미로에서는 경로를 찾지 못했습니다.";
    animateNumber(document.getElementById("stat-visited"), result.expandedCount ?? result.visitedCount ?? 0);
    if (result.pathLength == null) document.getElementById("stat-path").textContent = "—";
    else animateNumber(document.getElementById("stat-path"), result.pathLength);
    animateNumber(document.getElementById("stat-steps"), result.steps.length);
    const cert = state.learnCertificate;
    const setText = (elId, text) => {
      const el = document.getElementById(elId);
      if (el) el.textContent = text;
    };
    setText("stat-visited-unit", `(${EXPANSION_UNIT_LABELS[cert?.expansionUnit] || "칸"}, 목표 칸 제외)`);
    setText("stat-validity", cert?.pathValidityPassed == null ? "해당 없음" : (cert.pathValidityPassed ? "통과" : "실패"));
    setText("stat-guarantee", cert?.guaranteesOptimality ? `보장 (${cert.guaranteeCondition})` : `보장 안 함 (${cert?.guaranteeCondition || "—"})`);
    setText("stat-optimal", cert?.optimalityVerified == null
      ? (cert?.optimalityStatus === "unreachable-agrees" ? "도달 불가 일치" : "검증되지 않음")
      : (cert.optimalityVerified ? "일치" : "불일치"));
    document.getElementById("learn-quiz").hidden = false;
  }

  function hideLearnComplete() {
    state.learnFinished = false;
    document.getElementById("learn-complete").hidden = true;
    document.getElementById("learn-quiz").hidden = true;
  }

  function setScores(scores, strategy) {
    const show = ["astar", "dijkstra", "aefs", "aefsq", "greedy", "hfgs", "pair", "sley", "jps4"].includes(state.learnAlgo);
    document.getElementById("learn-scores").hidden = !show;
    document.getElementById("learn-confidence").hidden = state.learnAlgo !== "aefs" && state.learnAlgo !== "aefsq";
    document.getElementById("score-g").textContent = scores?.g ?? "—";
    document.getElementById("score-h").textContent = scores?.h ?? "—";
    document.getElementById("score-f").textContent = scores?.f ?? "—";
    if (state.learnAlgo === "dijkstra" || state.learnAlgo === "sley") {
      document.getElementById("score-h").textContent = "사용 안 함";
      document.getElementById("score-f").textContent = scores?.g ?? "—";
    }
    const c = scores?.C;
    document.getElementById("score-c").textContent = c == null ? "—" : Number(c).toFixed(2);
    document.getElementById("score-c-fill").style.width = c == null ? "0%" : `${Math.round(Number(c) * 100)}%`;
    const names = { bfs: "BFS형 탐색", goal: "목표 지향 탐색", mixed: "혼합 탐색" };
    document.getElementById("learn-strategy").textContent = strategy
      ? `전략: ${names[strategy] || strategy}`
      : "전략: 준비";
  }

  function updateProgress(index, total) {
    const current = Math.max(0, index + 1);
    document.getElementById("learn-progress").textContent = `Step ${current} / ${total}`;
    document.getElementById("learn-step-label").textContent = `${current} / ${total}`;
    document.getElementById("learn-progress-fill").style.width =
      total ? `${(current / total) * 100}%` : "0%";
  }

  function renderQuiz(id) {
    const quiz = QUIZZES[id];
    const box = document.getElementById("learn-quiz");
    if (!quiz) {
      box.hidden = true;
      return;
    }
    document.getElementById("quiz-question").textContent = quiz.question;
    const options = document.getElementById("quiz-options");
    options.innerHTML = "";
    const feedback = document.getElementById("quiz-feedback");
    feedback.hidden = true;
    quiz.options.forEach((text, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quiz-option";
      button.textContent = `${["①", "②", "③", "④"][index]} ${text}`;
      button.addEventListener("click", () => {
        [...options.children].forEach((el, i) => {
          el.disabled = true;
          if (i === quiz.answer) el.classList.add("is-correct");
        });
        if (index !== quiz.answer) button.classList.add("is-wrong");
        feedback.hidden = false;
        feedback.textContent = (index === quiz.answer ? "정답입니다. " : "아쉽습니다. ") + quiz.explanation;
      });
      options.appendChild(button);
    });
    box.hidden = true;
  }

  function bindExperiment() {
    document.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-tool]").forEach((el) => el.classList.remove("is-active"));
        btn.classList.add("is-active");
        expViz.setTool(btn.dataset.tool);
      });
    });

    document.querySelectorAll("[data-size]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-size]").forEach((el) => el.classList.remove("is-active"));
        btn.classList.add("is-active");
        const custom = document.getElementById("custom-size");
        if (btn.dataset.size === "custom") {
          custom.hidden = false;
          return;
        }
        custom.hidden = true;
        const preset = SIZE_PRESETS[btn.dataset.size];
        void applyMazeSize(preset.rows, preset.cols);
      });
    });

    document.getElementById("btn-apply-size").addEventListener("click", () => {
      const askedRows = Number(document.getElementById("custom-rows").value);
      const askedCols = Number(document.getElementById("custom-cols").value);
      const shape = clampMazeShape(askedRows, askedCols);
      document.getElementById("custom-rows").value = String(shape.rows);
      document.getElementById("custom-cols").value = String(shape.cols);
      void applyMazeSize(shape.rows, shape.cols);
    });

    const repeatSlider = document.getElementById("slider-repeats");
    const mazeCountSlider = document.getElementById("slider-maze-count");
    repeatSlider.addEventListener("input", () => {
      state.repeats = Number(repeatSlider.value);
      updateBatchSummary();
    });
    mazeCountSlider.addEventListener("input", () => {
      state.mazeCount = Number(mazeCountSlider.value);
      updateBatchSummary();
    });
    document.querySelectorAll('input[name="algo"]').forEach((box) => {
      box.addEventListener("change", updateBatchSummary);
    });
    updateBatchSummary();

    document.getElementById("btn-maze-clear").addEventListener("click", () => {
      if (isVirtualMaze(state.experimentMaze)) {
        setRunStatus("가상 미로는 칸을 지울 수 없습니다. 작은 크기로 바꾸면 편집할 수 있습니다.");
        return;
      }
      state.experimentMaze = clearMaze(state.experimentMaze);
      expViz.setMaze(state.experimentMaze);
      state.expOverlay = null;
    });

    document.getElementById("btn-maze-random").addEventListener("click", async () => {
      const multi = document.getElementById("maze-gen-type").value !== "single";
      setRunStatus("미로를 다시 만드는 중입니다…");
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      state.experimentMaze = generateRandomMaze(
        state.experimentMaze.rows,
        state.experimentMaze.cols,
        { multiPath: multi },
      );
      expViz.setMaze(state.experimentMaze);
      state.expOverlay = null;
      updateMazeSizeLabel();
      if (isVirtualMaze(state.experimentMaze)) {
        setRunStatus(`${formatMazeDim(state.experimentMaze.rows)} × ${formatMazeDim(state.experimentMaze.cols)} 가상 미로를 다시 만들었습니다. 통계 내기에서 유일 경로 길이를 계산합니다.`);
      } else {
        setRunStatus("랜덤 미로를 만들었습니다.");
      }
    });

    document.getElementById("btn-maze-save").addEventListener("click", () => {
      const name = `미로 ${state.experimentMaze.rows}×${state.experimentMaze.cols}`;
      saveMaze(name, cloneMaze(state.experimentMaze));
      refreshSavedMazes();
      setRunStatus("현재 미로를 이 브라우저에 저장했습니다.");
    });

    document.getElementById("btn-load-maze").addEventListener("click", () => {
      const id = document.getElementById("saved-maze-select").value;
      const item = loadMazes().find((maze) => maze.id === id);
      if (!item) {
        setRunStatus("불러올 미로를 먼저 선택하세요.");
        return;
      }
      state.experimentMaze = deserializeMaze(item.maze);
      expViz.setMaze(state.experimentMaze);
      updateMazeSizeLabel();
      setRunStatus(`‘${item.name}’ 미로를 불러왔습니다.`);
    });

    document.getElementById("btn-delete-maze").addEventListener("click", () => {
      const id = document.getElementById("saved-maze-select").value;
      if (!id) return;
      deleteMaze(id);
      refreshSavedMazes();
      setRunStatus("선택한 미로를 삭제했습니다.");
    });

    document.getElementById("btn-run-experiment").addEventListener("click", runExperiment);
    document.getElementById("btn-save-result").addEventListener("click", () => {
      if (!state.lastBenchmark) return;
      try {
        saveExperiment(state.lastBenchmark);
        refreshHistory();
        setRunStatus("실험 결과를 저장했습니다.");
      } catch (error) {
        setRunStatus(error.message);
      }
    });
    document.getElementById("btn-download-csv").addEventListener("click", () => {
      if (!state.lastBenchmark) return;
      downloadCsv(`graph-path-${Date.now()}.csv`, experimentToCsv(state.lastBenchmark));
    });
    document.getElementById("path-preview-select").addEventListener("change", (event) => {
      showPathPreview(event.target.value);
    });
  }

  async function applyMazeSize(rows, cols) {
    const multi = document.getElementById("maze-gen-type").value !== "single";
    setRunStatus("미로를 만드는 중입니다…");
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    try {
      const maze = generateRandomMaze(rows, cols, { multiPath: multi });
      state.experimentMaze = maze;
      state.expOverlay = null;
      expViz.setMaze(maze);
      updateMazeSizeLabel();
      if (isVirtualMaze(maze)) {
        setRunStatus(
          `${formatMazeDim(maze.rows)} × ${formatMazeDim(maze.cols)} 가상 미로입니다. 칸 배열 없이 구조를 그렸습니다. 통계 내기를 누르면 이 미로의 유일 경로 길이를 계산합니다.`,
        );
      } else {
        setRunStatus(`${maze.rows} × ${maze.cols} 미로를 만들었습니다. 통계 내기에서 실제 솔버가 실행됩니다.`);
      }
    } catch (error) {
      console.error(error);
      setRunStatus("미로를 만들지 못했습니다. 더 작은 크기를 넣어 보세요.");
    }
  }

  function updateMazeSizeLabel() {
    const maze = state.experimentMaze;
    const size = `${formatMazeDim(maze.rows)} × ${formatMazeDim(maze.cols)}`;
    document.getElementById("exp-maze-size").textContent = isVirtualMaze(maze) ? `${size} · 가상` : size;
  }

  function selectedAlgorithms() {
    return [...document.querySelectorAll('input[name="algo"]:checked')].map((el) => el.value);
  }

  function updateBatchSummary() {
    const algorithms = selectedAlgorithms().length;
    const repeats = Number(document.getElementById("slider-repeats").value);
    const mazeCount = Number(document.getElementById("slider-maze-count").value);
    state.repeats = repeats;
    state.mazeCount = mazeCount;
    document.getElementById("repeat-value").textContent = `${repeats}회`;
    document.getElementById("maze-count-value").textContent = `${mazeCount}개`;
    document.getElementById("batch-summary").textContent =
      `총 실행: 알고리즘 ${algorithms} × 미로 ${mazeCount} × 반복 ${repeats} = ${algorithms * mazeCount * repeats}회`;
  }

  function runExperiment() {
    if (isVirtualMaze(state.experimentMaze)) {
      runVirtualMazeFacts();
      return;
    }
    const algorithms = selectedAlgorithms();
    if (!algorithms.length) {
      setRunStatus("비교할 알고리즘을 하나 이상 선택하세요.");
      return;
    }
    const repeats = state.repeats;
    const mazeCount = state.mazeCount;
    const multi = document.getElementById("maze-gen-type").value !== "single";
    const mazes = [cloneMaze(state.experimentMaze)];
    for (let i = 1; i < mazeCount; i += 1) {
      mazes.push(generateRandomMaze(state.experimentMaze.rows, state.experimentMaze.cols, {
        multiPath: multi,
        forceGrid: true,
      }));
    }

    setRunStatus("통계를 계산하는 중입니다…");
    const button = document.getElementById("btn-run-experiment");
    button.disabled = true;

    window.setTimeout(async () => {
      try {
        const report = await benchmarkBatch(mazes, algorithms, repeats, (progress) => {
          setRunStatus(
            `진행 중 · 미로 ${progress.mazeIndex}/${progress.mazeCount} · ${ALGO_META[progress.algorithm].short} ${progress.repeat}/${progress.repeats}회`,
          );
        });
        report.id = `${Date.now()}`;
        report.maze = cloneMaze(mazes[0]);
        report.fingerprint = mazeFingerprint(mazes[0]);
        state.lastBenchmark = report;
        renderResults(report);
        if (report.implicitOriginal) {
          setRunStatus(
            `완료 · ${formatMazeDim(report.mazeSize.rows)} × ${formatMazeDim(report.mazeSize.cols)} 원본 미로에서 통계를 냈습니다.`,
          );
        } else if (report.virtualSearch) {
          setRunStatus(
            `완료 · ${formatMazeDim(report.mazeSize.rows)} × ${formatMazeDim(report.mazeSize.cols)} 가상 미로를 펼쳐 원본 칸을 실제로 탐색했습니다. 값은 실측 평균, 중앙값, p95, 표준편차입니다.`,
          );
        } else {
          setRunStatus(
            `완료 · 미로 ${mazeCount}개 · 각 ${repeats}회 반복 · 값은 실제 측정한 평균, 중앙값, p95, 표준편차입니다.`,
          );
        }
      } catch (error) {
        setRunStatus("통계를 내는 동안 오류가 났습니다. 미로와 알고리즘 선택을 확인하세요.");
        console.error(error);
      } finally {
        button.disabled = false;
      }
    }, 30);
  }

  function runVirtualMazeFacts() {
    const mazeCount = state.mazeCount;
    const button = document.getElementById("btn-run-experiment");
    button.disabled = true;
    setRunStatus("가상 미로의 유일 경로 길이를 계산하는 중입니다…");
    window.setTimeout(() => {
      try {
        const mazes = [cloneMaze(state.experimentMaze)];
        for (let i = 1; i < mazeCount; i += 1) {
          mazes.push(generateRandomMaze(state.experimentMaze.rows, state.experimentMaze.cols, {
            seed: ((state.experimentMaze.seed || 1) + i) | 0,
          }));
        }
        const facts = mazes.map((maze, index) => ({
          index: index + 1,
          ...virtualMazeFacts(maze),
        }));
        const report = {
          id: `${Date.now()}`,
          virtualFacts: true,
          maze: cloneMaze(mazes[0]),
          mazeSize: { rows: mazes[0].rows, cols: mazes[0].cols },
          mazeCount: facts.length,
          facts,
          algorithms: [],
          results: {},
        };
        state.lastBenchmark = report;
        renderVirtualMazeResults(report);
        setRunStatus(
          `완료 · ${formatMazeDim(mazes[0].rows)} × ${formatMazeDim(mazes[0].cols)} 가상 미로 ${facts.length}개의 유일 경로 길이를 계산했습니다.`,
        );
      } catch (error) {
        console.error(error);
        setRunStatus("가상 미로 경로를 계산하지 못했습니다.");
      } finally {
        button.disabled = false;
      }
    }, 30);
  }

  function renderVirtualMazeResults(report) {
    const section = document.getElementById("results-section");
    section.hidden = false;
    document.getElementById("results-caption").textContent =
      `${formatMazeDim(report.mazeSize.rows)}×${formatMazeDim(report.mazeSize.cols)} 가상 미로 ${report.mazeCount}개. 100억 버튼은 칸 배열 없이 이 크기를 보여 주기 위한 것입니다. 아래 숫자는 재귀 분할 미로의 유일 경로이지 BFS/PAIR/TIER 결과가 아닙니다.`;
    const metricNote = document.getElementById("result-metric-note");
    if (metricNote) {
      metricNote.textContent = "칸 솔버 비교를 하려면 21×21~401×401을 쓰세요. 여기서는 미로 자체의 경로 길이만 계산합니다.";
    }
    const warnBox = document.getElementById("result-warnings");
    if (warnBox) {
      warnBox.innerHTML = "";
      warnBox.hidden = true;
    }
    const headers = ["미로", "seed", "유일 경로 길이", "계산 시간 (ms)", "시작", "목표", "경로 점"];
    const headRow = document.getElementById("result-table-head-row");
    headRow.innerHTML = "";
    headers.forEach((text) => {
      const th = document.createElement("th");
      th.textContent = text;
      headRow.appendChild(th);
    });
    const tbody = document.querySelector("#result-table tbody");
    tbody.innerHTML = "";
    const select = document.getElementById("path-preview-select");
    select.innerHTML = '<option value="">가상 미로 경로를 보려면 행을 선택하세요</option>';
    report.facts.forEach((fact, index) => {
      const cells = [
        fact.index,
        fact.seed,
        fact.uniquePathHops.toLocaleString("ko-KR"),
        fact.computeMs.toFixed(4),
        `(${fact.start.row}, ${fact.start.col})`,
        `(${fact.goal.row}, ${fact.goal.col})`,
        fact.waypointCount,
      ];
      const tr = document.createElement("tr");
      cells.forEach((value) => {
        const td = document.createElement("td");
        td.textContent = String(value);
        tr.appendChild(td);
      });
      tr.addEventListener("click", () => {
        expViz.setDisplay({ path: fact.path || [] });
        [...tbody.children].forEach((row) => row.classList.remove("is-selected"));
        tr.classList.add("is-selected");
      });
      tbody.appendChild(tr);
      const option = document.createElement("option");
      option.value = `virtual-${index}`;
      option.textContent = `가상 미로 ${fact.index}`;
      select.appendChild(option);
    });
    if (report.facts[0]?.path) {
      expViz.setDisplay({ path: report.facts[0].path });
    }
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderResults(report) {
    if (report.virtualFacts) {
      renderVirtualMazeResults(report);
      return;
    }
    const section = document.getElementById("results-section");
    section.hidden = false;
    const mazeCount = report.mazeCount || 1;
    const samples = report.results[report.algorithms[0]]?.sampleCount
      || mazeCount * report.repeats;
    document.getElementById("results-caption").textContent = report.implicitOriginal
      ? `${formatMazeDim(report.mazeSize.rows)}×${formatMazeDim(report.mazeSize.cols)} 미로는 칸 배열을 만들 수 없어 솔버를 실행하지 않았습니다. 방 그래프 프록시 숫자도 넣지 않았습니다.`
      : `${report.mazeSize.rows}×${report.mazeSize.cols} · 미로 ${mazeCount}개 · 미로당 ${report.repeats}회 · 알고리즘당 ${samples}개 표본. 탐색 수는 실제로 연 칸 수입니다.`;
    const metricNote = document.getElementById("result-metric-note");
    if (metricNote) {
      metricNote.textContent = report.results[report.algorithms[0]]?.measured === false
        ? "이 크기는 칸 배열을 만들 수 없습니다. PAIR/TIER/Bi-BFS 등 실제 솔버를 실행하지 않았고, 방 그래프 프록시 숫자도 알고리즘 결과로 넣지 않습니다."
        : `각 알고리즘은 자기 구현 파일을 실행합니다. 시간에 포함: ${TIMING_SCOPE.includes.join(", ")}. 시간에서 제외: ${TIMING_SCOPE.excludes.join(", ")}. 작은 미로는 한 측정마다 여러 번 반복해 평균 시간을 냅니다. 0.2ms 차이는 순위가 아닙니다. 노드 수는 목표 칸을 꺼내자마자 멈추면 목표를 확장에 넣지 않으며, 집계 단위가 다른 행(점프 지점, 비트 세대)은 같은 순위로 비교하지 않습니다. 최단 일치는 알고리즘 코드를 쓰지 않는 독립 BFS/Dijkstra와 비교한 값입니다.`;
    }
    const warnBox = document.getElementById("result-warnings");
    if (warnBox) {
      const grouped = new Map();
      report.algorithms.forEach((id) => {
        (report.results[id].warnings || []).forEach((text) => {
          if (!grouped.has(text)) grouped.set(text, []);
          grouped.get(text).push(ALGO_META[id].short);
        });
      });
      const lines = [...grouped.entries()].map(([text, names]) => (
        names.length === report.algorithms.length
          ? `모든 알고리즘: ${text}`
          : `${names.join(", ")}: ${text}`
      ));
      warnBox.innerHTML = "";
      warnBox.hidden = lines.length === 0;
      lines.forEach((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        warnBox.appendChild(li);
      });
    }

    const headRow = document.getElementById("result-table-head-row");
    if (headRow) {
      headRow.innerHTML = "";
      TABLE_COLUMNS.forEach((col) => {
        const th = document.createElement("th");
        th.textContent = col.header;
        if (col.key !== "algorithm" && col.key !== "branch" && col.key !== "verification") {
          th.className = "num";
        }
        headRow.appendChild(th);
      });
      if (headRow.children.length !== TABLE_COLUMNS.length) {
        throw new Error("결과 표 헤더 열 수가 스키마와 다릅니다");
      }
    }
    const tbody = document.querySelector("#result-table tbody");
    tbody.innerHTML = "";
    const select = document.getElementById("path-preview-select");
    select.innerHTML = '<option value="">첫 번째 미로에서 경로를 보려면 알고리즘을 선택하세요</option>';

    report.algorithms.forEach((id) => {
      const meta = ALGO_META[id];
      const named = buildResultRow(report, id, meta.short);
      const cells = tableCells(named);
      const tr = document.createElement("tr");
      cells.forEach((value) => {
        const td = document.createElement("td");
        td.textContent = formatCell(value);
        td.className = "num";
        tr.appendChild(td);
      });
      tr.firstChild.className = "";
      if (tr.children.length !== TABLE_COLUMNS.length) {
        throw new Error("결과 표 행 열 수가 헤더와 다릅니다");
      }
      tr.addEventListener("click", () => {
        select.value = id;
        showPathPreview(id);
        [...tbody.children].forEach((row) => row.classList.remove("is-selected"));
        tr.classList.add("is-selected");
      });
      tbody.appendChild(tr);
      const option = document.createElement("option");
      option.value = id;
      option.textContent = meta.short;
      select.appendChild(option);
    });

    drawCharts(report);
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showPathPreview(id) {
    const report = state.lastBenchmark;
    if (!report || !id) {
      expViz.setDisplay({ path: [] });
      return;
    }
    if (report.virtualFacts) {
      const index = Number(String(id).replace("virtual-", ""));
      expViz.setDisplay({ path: report.facts[index]?.path || [] });
      return;
    }
    if (!report.results[id]) {
      expViz.setDisplay({ path: [] });
      return;
    }
    expViz.setDisplay({ path: report.results[id].path || [] });
  }

  function drawCharts(report) {
    if (typeof window.Chart === "undefined") return;
    const labels = report.algorithms.map((id) => ALGO_META[id].short);
    const colors = report.algorithms.map((id) => ALGO_META[id].color);
    const times = report.algorithms.map((id) => Number((report.results[id].avgTimeMs ?? 0).toFixed(4)));
    const visited = report.algorithms.map((id) => report.results[id].avgExpandedCount ?? report.results[id].avgVisited ?? 0);
    const units = new Set(report.algorithms.map((id) => report.results[id].expansionUnit || "cells"));
    const paths = report.algorithms.map((id) => {
      const item = report.results[id];
      if (item.measured === false || item.pathLengthSource === "unique-tree-hops") return 0;
      if (illegalPathLength(report.mazeSize.rows, report.mazeSize.cols, item.avgPathLength)) return 0;
      return item.found ? item.avgPathLength : 0;
    });
    const heuristics = report.algorithms.map((id) => report.results[id].heuristicEvals ?? 0);

    charts.time = upsertChart(charts.time, "chart-time", labels, times, colors, "ms");
    const visitedUnit = report.implicitOriginal ? "방" : (units.size === 1 ? (EXPANSION_UNIT_LABELS[[...units][0]] || "칸") : "노드(단위 섞임: 표의 집계 단위 참고)");
    charts.visited = upsertChart(charts.visited, "chart-visited", labels, visited, colors, visitedUnit);
    charts.path = upsertChart(charts.path, "chart-path", labels, paths, colors, "이동");
    charts.heuristic = upsertChart(charts.heuristic, "chart-heuristic", labels, heuristics, colors, "회");
  }

  function refreshSavedMazes() {
    const select = document.getElementById("saved-maze-select");
    const mazes = loadMazes();
    select.innerHTML = '<option value="">선택하세요</option>';
    mazes.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.name} · ${new Date(item.savedAt).toLocaleString("ko-KR")}`;
      select.appendChild(option);
    });
  }

  function refreshHistory() {
    const list = document.getElementById("history-list");
    const items = loadExperiments();
    if (!items.length) {
      list.innerHTML = '<p class="empty-history">아직 저장된 실험이 없습니다.</p>';
      return;
    }
    list.innerHTML = "";
    items.forEach((item) => {
      const el = document.createElement("article");
      el.className = "history-item";
      const names = item.algorithms.map((id) => ALGO_META[id].short).join(", ");
      el.innerHTML = `
        <div>
          <strong>${item.mazeSize.rows}×${item.mazeSize.cols} · 미로 ${item.mazeCount || 1}개 · 각 ${item.repeats}회</strong>
          <p>${new Date(item.createdAt).toLocaleString("ko-KR")} · ${names}</p>
        </div>
        <div class="editor-actions">
          <button type="button" class="btn btn-small" data-hist-view="${item.id}">보기</button>
          <button type="button" class="btn btn-small" data-hist-csv="${item.id}">CSV</button>
          <button type="button" class="btn btn-small btn-danger-ghost" data-hist-del="${item.id}">삭제</button>
        </div>
      `;
      list.appendChild(el);
    });
    list.querySelectorAll("[data-hist-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = loadExperiments().find((exp) => exp.id === btn.dataset.histView);
        if (!item) return;
        state.lastBenchmark = item;
        if (item.maze) {
          state.experimentMaze = deserializeMaze(item.maze);
          expViz.setMaze(state.experimentMaze);
        }
        renderResults(item);
      });
    });
    list.querySelectorAll("[data-hist-csv]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = loadExperiments().find((exp) => exp.id === btn.dataset.histCsv);
        if (item) downloadCsv(`graph-path-${item.id}.csv`, experimentToCsv(item));
      });
    });
    list.querySelectorAll("[data-hist-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        deleteExperiment(btn.dataset.histDel);
        refreshHistory();
      });
    });
  }

  function setRunStatus(text) {
    document.getElementById("run-status").textContent = text;
  }

  return { showView, selectLearnAlgo };
}

function formatStat(value, digits) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  if (Math.abs(value) >= 10000) return Math.round(value).toLocaleString("ko-KR");
  return Number(value).toFixed(digits);
}

function formatPercent(rate, found) {
  if (rate == null) return found ? "예" : "아니오";
  return `${Math.round(Number(rate) * 100)}%`;
}

function speedToDelay(value) {
  return Math.round(720 - value * 6.6);
}

function animateNumber(el, target) {
  const start = performance.now();
  const from = 0;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 420);
    const eased = 1 - (1 - t) * (1 - t);
    el.textContent = String(Math.round(from + (target - from) * eased));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function upsertChart(existing, canvasId, labels, data, colors, unit) {
  const canvas = document.getElementById(canvasId);
  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map((c) => `${c}cc`),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 8,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y} ${unit}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          grid: { color: "#eeeae1" },
        },
      },
    },
  };
  if (existing) {
    existing.data = config.data;
    existing.update();
    return existing;
  }
  return new window.Chart(canvas, config);
}

function selfCheck() {
  const maze = generateRandomMaze(9, 9, { multiPath: true });
  const bfs = RUNNERS.bfs(maze, { recordSteps: false });
  const dfs = RUNNERS.dfs(maze, { recordSteps: false });
  const dijkstra = RUNNERS.dijkstra(maze, { recordSteps: false });
  const astar = RUNNERS.astar(maze, { recordSteps: false });
  const aefs = RUNNERS.aefs(maze, { recordSteps: false });
  const aefsq = RUNNERS.aefsq(maze, { recordSteps: false });
  const hfgs = RUNNERS.hfgs(maze, { recordSteps: false });
  const rim = RUNNERS.rim(maze, { recordSteps: false });
  const bpbfs = RUNNERS.bpbfs(maze, { recordSteps: false });
  const jps4 = RUNNERS.jps4(maze, { recordSteps: false });
  if (!bfs.found || !dfs.found || !dijkstra.found || !astar.found || !aefs.found || !aefsq.found || !hfgs.found || !rim.found || !bpbfs.found || !jps4.found) {
    console.error("자기 검증 실패: 경로를 찾지 못했습니다.");
    return;
  }
  if (bfs.pathLength !== dijkstra.pathLength) {
    console.error("자기 검증 실패: 비용이 1인 미로에서 BFS와 Dijkstra의 경로 길이가 다릅니다.");
  }
  if (bpbfs.pathLength !== bfs.pathLength) {
    console.error("자기 검증 실패: 비용이 1인 미로에서 BP-BFS와 BFS의 경로 길이가 다릅니다.");
  }
  if (jps4.pathLength !== bfs.pathLength) {
    console.error("자기 검증 실패: 비용이 1인 미로에서 JPS4와 BFS의 경로 길이가 다릅니다.");
  }
}
