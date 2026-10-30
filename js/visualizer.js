import {
  CELL_WALL,
  cellKey,
  exceedsCellLimit,
  getCell,
  getWeight,
  isVirtualMaze,
  isWalkable,
  sameCell,
} from "./maze.js";
import { paintVirtualPreview } from "./virtual-maze.js";

const COLORS = {
  bg: "#f3f1eb",
  empty: "#ffffff",
  wall: "#1f1f1f",
  start: "#2563eb",
  end: "#ea580c",
  current: "#eab308",
  visited: "#bfdbfe",
  frontier: "#86efac",
  path: "#8b5cf6",
  weight: "#fde68a",
  text: "#141414",
  dim: "#ffffff",
};

export class MazeVisualizer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.maze = null;
    this.editable = Boolean(options.editable);
    this.tool = "wall";
    this.display = emptyDisplay();
    this.layout = { cell: 20, gap: 3, pad: 12 };
    this.drawing = false;
    this.lastPaintKey = "";
    this.pulse = 0;
    this.raf = 0;
    this.onChange = options.onChange || null;
    this.needsPulse = false;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleResize = this.handleResize.bind(this);

    if (this.editable) {
      canvas.addEventListener("pointerdown", this.handlePointerDown);
      window.addEventListener("pointermove", this.handlePointerMove);
      window.addEventListener("pointerup", this.handlePointerUp);
    }
    window.addEventListener("resize", this.handleResize);
  }

  setMaze(maze) {
    this.maze = maze;
    this.resize();
    this.render();
    window.requestAnimationFrame(() => {
      if (this.maze === maze) this.resize();
    });
  }

  setTool(tool) {
    this.tool = tool;
  }

  setDisplay(display) {
    this.display = { ...emptyDisplay(), ...display };
    this.needsPulse = Boolean(display?.current);
    this.render();
    if (this.needsPulse) this.startPulse();
  }

  clearDisplay() {
    this.display = emptyDisplay();
    this.needsPulse = false;
    this.render();
  }

  resize() {
    if (!this.maze) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const preview = shouldPreview(this.maze);
    const pad = preview ? 10 : 12;
    const boxW = 520;
    const boxH = preview ? 400 : Math.min(520, boxW);
    const innerW = boxW - pad * 2;
    const innerH = boxH - pad * 2;
    const scale = Math.min(innerW / Math.max(1, this.maze.cols), innerH / Math.max(1, this.maze.rows));
    const gap = !preview && scale >= 8 ? (this.maze.rows > 25 ? 1.5 : 3) : 0;
    const cell = preview ? 1 : Math.max(1, scale - gap);
    this.layout = { cell, gap, pad, dense: preview || cell < 3, virtual: preview };
    this.canvas.style.width = `${boxW}px`;
    this.canvas.style.height = `${boxH}px`;
    this.dpr = dpr;
    this.canvas.width = Math.round(boxW * dpr);
    this.canvas.height = Math.round(boxH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  handleResize() {
    this.resize();
  }

  cellFromEvent(event) {
    if (!this.maze) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const { cell, gap, pad } = this.layout;
    const col = Math.floor((x - pad) / (cell + gap));
    const row = Math.floor((y - pad) / (cell + gap));
    if (row < 0 || col < 0 || row >= this.maze.rows || col >= this.maze.cols) return null;
    return { row, col };
  }

  handlePointerDown(event) {
    if (!this.editable || !this.maze) return;
    this.canvas.setPointerCapture?.(event.pointerId);
    this.drawing = true;
    this.lastPaintKey = "";
    this.paintCell(this.cellFromEvent(event));
  }

  handlePointerMove(event) {
    if (!this.drawing) return;
    this.paintCell(this.cellFromEvent(event));
  }

  handlePointerUp() {
    this.drawing = false;
    this.lastPaintKey = "";
  }

  paintCell(cell) {
    if (!cell || !this.maze || isVirtualMaze(this.maze)) return;
    const key = cellKey(cell.row, cell.col);
    if (key === this.lastPaintKey) return;
    this.lastPaintKey = key;
    const maze = this.maze;
    const isStart = sameCell(cell, maze.start);
    const isEnd = sameCell(cell, maze.end);

    if (this.tool === "start") {
      if (isEnd) return;
      maze.cells[cell.row][cell.col] = 0;
      maze.weights[cell.row][cell.col] = 1;
      maze.start = { ...cell };
    } else if (this.tool === "end") {
      if (isStart) return;
      maze.cells[cell.row][cell.col] = 0;
      maze.weights[cell.row][cell.col] = 1;
      maze.end = { ...cell };
    } else if (this.tool === "wall") {
      if (isStart || isEnd) return;
      maze.cells[cell.row][cell.col] = CELL_WALL;
      maze.weights[cell.row][cell.col] = 1;
    } else if (this.tool === "erase") {
      if (isStart || isEnd) return;
      maze.cells[cell.row][cell.col] = 0;
      maze.weights[cell.row][cell.col] = 1;
    } else if (this.tool === "weight") {
      if (isStart || isEnd || maze.cells[cell.row][cell.col] === CELL_WALL) return;
      maze.weights[cell.row][cell.col] = maze.weights[cell.row][cell.col] === 5 ? 1 : 5;
    }

    this.render();
    this.onChange?.(maze);
  }

  startPulse() {
    if (this.raf) return;
    const tick = () => {
      if (!this.needsPulse) {
        this.raf = 0;
        return;
      }
      this.pulse = (this.pulse + 0.06) % (Math.PI * 2);
      this.render();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  render() {
    const { ctx, maze, layout } = this;
    if (!maze) return;
    const width = this.canvas.width / (this.dpr || window.devicePixelRatio || 1);
    const height = this.canvas.height / (this.dpr || window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.bg;
    roundRect(ctx, 0, 0, width, height, layout.dense ? 8 : 16);
    ctx.fill();

    if (this.layout.virtual || isVirtualMaze(maze)) {
      this.renderVirtual(width, height);
      return;
    }

    const visited = new Set((this.display.visited || []).map((c) => cellKey(c.row, c.col)));
    const frontier = new Set((this.display.frontier || []).map((c) => cellKey(c.row, c.col)));
    const path = new Set((this.display.path || []).map((c) => cellKey(c.row, c.col)));
    const current = this.display.current;
    const paint = (r, c) => cellFill(maze, r, c, visited, frontier, path, current);

    if (layout.dense) {
      this.renderDense(paint);
    } else {
      for (let r = 0; r < maze.rows; r += 1) {
        for (let c = 0; c < maze.cols; c += 1) {
          const { x, y, size } = this.cellRect(r, c);
          const cell = { row: r, col: c };
          ctx.fillStyle = paint(r, c);
          roundRect(ctx, x, y, size, size, Math.min(6, size * 0.28));
          ctx.fill();

          if (current && sameCell(current, cell)) {
            const glow = 0.35 + 0.25 * Math.sin(this.pulse);
            ctx.strokeStyle = `rgba(20,20,20,${0.35 + glow})`;
            ctx.lineWidth = 2;
            roundRect(ctx, x + 1, y + 1, size - 2, size - 2, Math.min(6, size * 0.28));
            ctx.stroke();
          }

          if (sameCell(maze.start, cell) || sameCell(maze.end, cell)) {
            ctx.fillStyle = "#fff";
            ctx.font = `700 ${Math.max(9, size * 0.42)}px Pretendard, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(sameCell(maze.start, cell) ? "S" : "E", x + size / 2, y + size / 2 + 0.5);
          } else if (isWalkable(maze, r, c) && getWeight(maze, r, c) > 1 && size > 14) {
            ctx.fillStyle = "rgba(20,20,20,0.55)";
            ctx.font = `650 ${Math.max(8, size * 0.32)}px Pretendard, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(getWeight(maze, r, c)), x + size / 2, y + size / 2);
          }
        }
      }
    }

    if (this.display.path && this.display.path.length > 1) {
      ctx.strokeStyle = "rgba(91, 33, 182, 0.85)";
      ctx.lineWidth = Math.max(2, layout.cell * 0.18);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      this.display.path.forEach((cell, i) => {
        const { x, y, size } = this.cellRect(cell.row, cell.col);
        const px = x + size / 2;
        const py = y + size / 2;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
  }

  renderVirtual(width, height) {
    const { ctx, maze, layout } = this;
    const { pad } = layout;
    try {
      paintVirtualPreview(ctx, maze, {
        x: pad,
        y: pad,
        w: Math.max(8, width - pad * 2),
        h: Math.max(8, height - pad * 2),
      });
    } catch (error) {
      ctx.fillStyle = COLORS.empty;
      ctx.fillRect(pad, pad, width - pad * 2, height - pad * 2);
      ctx.strokeStyle = COLORS.wall;
      ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);
    }
  }

  renderDense(paint) {
    const { ctx, maze, layout } = this;
    const { cell, gap, pad } = layout;
    const step = cell + gap;
    const x0 = pad;
    const y0 = pad;
    const w = maze.cols * step - (gap || 0);
    const h = maze.rows * step - (gap || 0);
    ctx.fillStyle = COLORS.empty;
    ctx.fillRect(x0, y0, w, h);
    if (exceedsCellLimit(maze.rows, maze.cols, 150000)) {
      const maxY = Math.max(1, Math.ceil(h));
      const maxX = Math.max(1, Math.ceil(w));
      for (let py = 0; py < maxY; py += 1) {
        const r = Math.min(maze.rows - 1, Math.floor(py / step));
        let runColor = null;
        let runStart = 0;
        for (let px = 0; px <= maxX; px += 1) {
          const color = px < maxX ? paint(r, Math.min(maze.cols - 1, Math.floor(px / step))) : null;
          if (color === runColor) continue;
          if (runColor && runColor !== COLORS.empty) {
            ctx.fillStyle = runColor;
            ctx.fillRect(x0 + runStart, y0 + py, px - runStart, 1);
          }
          runColor = color;
          runStart = px;
        }
      }
      return;
    }
    for (let r = 0; r < maze.rows; r += 1) {
      for (let c = 0; c < maze.cols; c += 1) {
        const color = paint(r, c);
        if (color === COLORS.empty) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x0 + c * step, y0 + r * step, Math.max(1, cell), Math.max(1, cell));
      }
    }
  }

  cellRect(row, col) {
    const { cell, gap, pad } = this.layout;
    if (this.layout.virtual && this.maze) {
      const width = this.canvas.width / (window.devicePixelRatio || 1);
      const height = this.canvas.height / (window.devicePixelRatio || 1);
      const innerW = Math.max(1, width - pad * 2);
      const innerH = Math.max(1, height - pad * 2);
      const maxC = Math.max(1, this.maze.cols - 1);
      const maxR = Math.max(1, this.maze.rows - 1);
      return {
        x: pad + (col / maxC) * innerW,
        y: pad + (row / maxR) * innerH,
        size: 6,
      };
    }
    return {
      x: pad + col * (cell + gap),
      y: pad + row * (cell + gap),
      size: cell,
    };
  }
}

function cellFill(maze, r, c, visited, frontier, path, current) {
  const key = cellKey(r, c);
  const cell = { row: r, col: c };
  let fill = COLORS.empty;
  if (getCell(maze, r, c) === CELL_WALL) fill = COLORS.wall;
  else if (getWeight(maze, r, c) > 1) fill = COLORS.weight;
  if (visited.has(key)) fill = COLORS.visited;
  if (frontier.has(key)) fill = COLORS.frontier;
  if (path.has(key)) fill = COLORS.path;
  if (current && sameCell(current, cell)) fill = COLORS.current;
  if (sameCell(maze.start, cell)) fill = COLORS.start;
  if (sameCell(maze.end, cell)) fill = COLORS.end;
  return fill;
}

export class Playback {
  constructor(visualizer, handlers = {}) {
    this.visualizer = visualizer;
    this.handlers = handlers;
    this.steps = [];
    this.path = [];
    this.index = -1;
    this.playing = false;
    this.timer = 0;
    this.delay = 220;
    this.visited = [];
  }

  load(result) {
    this.stop();
    this.steps = result.steps || [];
    this.path = result.path || [];
    this.index = -1;
    this.visited = [];
    this.visualizer.clearDisplay();
    this.handlers.onStep?.(-1, this.steps.length, null);
  }

  setDelay(ms) {
    this.delay = ms;
  }

  play() {
    if (!this.steps.length || this.index >= this.steps.length - 1) {
      this.reset();
    }
    this.playing = true;
    this.tick();
  }

  pause() {
    this.playing = false;
    window.clearTimeout(this.timer);
  }

  stop() {
    this.pause();
  }

  reset() {
    this.pause();
    this.index = -1;
    this.visited = [];
    this.visualizer.clearDisplay();
    this.handlers.onStep?.(-1, this.steps.length, null);
  }

  stepOnce() {
    if (this.index >= this.steps.length - 1) return;
    this.index += 1;
    this.apply(this.steps[this.index]);
  }

  tick() {
    if (!this.playing) return;
    if (this.index >= this.steps.length - 1) {
      this.playing = false;
      this.handlers.onDone?.();
      return;
    }
    this.stepOnce();
    this.timer = window.setTimeout(() => this.tick(), this.delay);
  }

  apply(step) {
    if (step.visitedAdd) {
      const key = cellKey(step.visitedAdd.row, step.visitedAdd.col);
      if (!this.visited.some((c) => cellKey(c.row, c.col) === key)) {
        this.visited.push({ ...step.visitedAdd });
      }
    }
    this.visualizer.setDisplay({
      current: step.current,
      visited: this.visited,
      frontier: step.frontier || [],
      path: step.path || (this.index === this.steps.length - 1 ? this.path : []),
    });
    this.handlers.onStep?.(this.index, this.steps.length, step);
    if (step.event === "complete") this.handlers.onDone?.();
  }
}

function shouldPreview(maze) {
  if (!maze) return false;
  if (isVirtualMaze(maze)) return true;
  if (maze.rows > 280 || maze.cols > 280) return true;
  return exceedsCellLimit(maze.rows, maze.cols, 40000);
}

function emptyDisplay() {
  return { current: null, visited: [], frontier: [], path: [] };
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
