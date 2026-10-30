/** 재귀 분할 가상 미로. 칸 배열을 만들지 않고 벽과 최단(유일) 경로 길이를 계산한다.
 * 홀수 칸은 통로, 짝수 칸은 벽/틈이라 자식 벽이 부모 틈을 막지 않는다.
 */

function u32(n) {
  return n >>> 0;
}

function mix(a, b, c) {
  let x = u32(a) ^ Math.imul(u32(b), 0x45d9f3b) ^ u32(c);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 13), 0x27d4eb2d);
  return u32(x ^ (x >>> 16));
}

function pickIndex(len, salt, seed, r0, c0) {
  if (len <= 1) return 0;
  const h = mix(r0, c0, seed ^ salt);
  if (len <= 0x7fffffff) return h % len;
  return Math.floor((h / 4294967296) * len);
}

export function oddInterior(n) {
  const value = n % 2 === 1 ? n : n - 1;
  return Math.max(1, value);
}

function evenCount(a, b) {
  return Math.max(0, (b - a) / 2);
}

function evenAt(a, i) {
  return a + 1 + 2 * i;
}

function oddCount(a, b) {
  return (b - a) / 2 + 1;
}

function oddAt(a, i) {
  return a + 2 * i;
}

const MAX_SPLIT_DEPTH = 16;

function split(r0, c0, r1, c1, seed, depth) {
  if (depth >= MAX_SPLIT_DEPTH) return null;
  const er = evenCount(r0, r1);
  const ec = evenCount(c0, c1);
  if (er < 1 && ec < 1) return null;
  const vertical = ec > 0 && (er === 0 || ec > er || (ec === er && (mix(r0, c0, seed) & 1) === 0));
  if (vertical) {
    const wc = evenAt(c0, pickIndex(ec, 1, seed, r0, c0));
    const rg = oddAt(r0, pickIndex(oddCount(r0, r1), 2, seed, r0, c0));
    return { vertical: true, wc, rg };
  }
  const wr = evenAt(r0, pickIndex(er, 3, seed, r0, c0));
  const cg = oddAt(c0, pickIndex(oddCount(c0, c1), 4, seed, r0, c0));
  return { vertical: false, wr, cg };
}

export function forEachVirtualSplit(maze, visit, maxDepth = 12) {
  const seed = maze.seed | 0;
  const end = chamberEnd(maze);
  function rec(r0, c0, r1, c1, depth) {
    if (depth > maxDepth) return;
    const cut = split(r0, c0, r1, c1, seed, depth);
    if (!cut) return;
    if (cut.vertical) {
      visit({ vertical: true, col: cut.wc, row0: r0, row1: r1, gapRow: cut.rg, depth });
      rec(r0, c0, r1, cut.wc - 1, depth + 1);
      rec(r0, cut.wc + 1, r1, c1, depth + 1);
      return;
    }
    visit({ vertical: false, row: cut.wr, col0: c0, col1: c1, gapCol: cut.cg, depth });
    rec(r0, c0, cut.wr - 1, c1, depth + 1);
    rec(cut.wr + 1, c0, r1, c1, depth + 1);
  }
  rec(1, 1, end.row, end.col, 0);
}

export function chamberEnd(maze) {
  return {
    row: oddInterior(maze.rows - 2),
    col: oddInterior(maze.cols - 2),
  };
}

export function virtualIsWall(maze, row, col) {
  if (row <= 0 || col <= 0 || row >= maze.rows - 1 || col >= maze.cols - 1) return true;
  const end = chamberEnd(maze);
  if (row > end.row || col > end.col) return true;
  if (row === maze.start.row && col === maze.start.col) return false;
  if (row === maze.end.row && col === maze.end.col) return false;
  if (row % 2 === 1 && col % 2 === 1) return false;
  if (row % 2 === 0 && col % 2 === 0) return true;
  return wallInside(row, col, 1, 1, end.row, end.col, maze.seed | 0, 0);
}

function wallInside(row, col, r0, c0, r1, c1, seed, depth) {
  const cut = split(r0, c0, r1, c1, seed, depth);
  if (!cut) return false;
  if (cut.vertical) {
    if (col === cut.wc) return row !== cut.rg;
    if (col < cut.wc) return wallInside(row, col, r0, c0, r1, cut.wc - 1, seed, depth + 1);
    return wallInside(row, col, r0, cut.wc + 1, r1, c1, seed, depth + 1);
  }
  if (row === cut.wr) return col !== cut.cg;
  if (row < cut.wr) return wallInside(row, col, r0, c0, cut.wr - 1, c1, seed, depth + 1);
  return wallInside(row, col, cut.wr + 1, c0, r1, c1, seed, depth + 1);
}

function roomWalkable(r0, c0, r1, c1) {
  const h = r1 - r0 + 1;
  const w = c1 - c0 + 1;
  const evenR = (r1 - r0) / 2;
  const evenC = (c1 - c0) / 2;
  return h * w - evenR * evenC;
}

export function buildVirtualRooms(maze) {
  const seed = maze.seed | 0;
  const end = chamberEnd(maze);
  const rooms = [];
  function rec(r0, c0, r1, c1, depth) {
    const cut = split(r0, c0, r1, c1, seed, depth);
    if (!cut) {
      const id = rooms.length;
      rooms.push({
        id,
        r0,
        c0,
        r1,
        c1,
        neighbors: [],
        walkable: roomWalkable(r0, c0, r1, c1),
      });
      return id;
    }
    if (cut.vertical) {
      const left = rec(r0, c0, r1, cut.wc - 1, depth + 1);
      const right = rec(r0, cut.wc + 1, r1, c1, depth + 1);
      const door = { row: cut.rg, col: cut.wc };
      rooms[left].neighbors.push({ room: right, door });
      rooms[right].neighbors.push({ room: left, door });
      rooms[left].walkable += 1;
      return left;
    }
    const top = rec(r0, c0, cut.wr - 1, c1, depth + 1);
    const bottom = rec(cut.wr + 1, c0, r1, c1, depth + 1);
    const door = { row: cut.wr, col: cut.cg };
    rooms[top].neighbors.push({ room: bottom, door });
    rooms[bottom].neighbors.push({ room: top, door });
    rooms[top].walkable += 1;
    return top;
  }
  rec(1, 1, end.row, end.col, 0);
  const locate = (row, col) => rooms.findIndex((room) => (
    row >= room.r0 && row <= room.r1 && col >= room.c0 && col <= room.c1
  ));
  return {
    rooms,
    startRoom: locate(maze.start.row, maze.start.col),
    endRoom: locate(maze.end.row, maze.end.col),
  };
}

export function virtualPath(maze) {
  const start = maze.start;
  const end = maze.end;
  const chamber = chamberEnd(maze);
  const hops = pathHops(start.row, start.col, end.row, end.col, 1, 1, chamber.row, chamber.col, maze.seed | 0, 0);
  const waypoints = [];
  collectWaypoints(start.row, start.col, end.row, end.col, 1, 1, chamber.row, chamber.col, maze.seed | 0, waypoints, 0);
  if (!waypoints.length || waypoints[0].row !== start.row || waypoints[0].col !== start.col) {
    waypoints.unshift({ row: start.row, col: start.col });
  }
  const last = waypoints[waypoints.length - 1];
  if (!last || last.row !== end.row || last.col !== end.col) {
    waypoints.push({ row: end.row, col: end.col });
  }
  return { hops, waypoints };
}

function man(r0, c0, r1, c1) {
  return Math.abs(r0 - r1) + Math.abs(c0 - c1);
}

function sideOf(value, cut) {
  if (value < cut) return -1;
  if (value > cut) return 1;
  return 0;
}

function pathHops(sr, sc, er, ec, r0, c0, r1, c1, seed, depth) {
  if (sr === er && sc === ec) return 0;
  const cut = split(r0, c0, r1, c1, seed, depth);
  if (!cut) return man(sr, sc, er, ec);
  if (cut.vertical) {
    const { wc, rg } = cut;
    const s = sideOf(sc, wc);
    const e = sideOf(ec, wc);
    if (s === e) {
      if (s < 0) return pathHops(sr, sc, er, ec, r0, c0, r1, wc - 1, seed, depth + 1);
      if (s > 0) return pathHops(sr, sc, er, ec, r0, wc + 1, r1, c1, seed, depth + 1);
      return man(sr, sc, er, ec);
    }
    const left = (ar, ac, br, bc) => pathHops(ar, ac, br, bc, r0, c0, r1, wc - 1, seed, depth + 1);
    const right = (ar, ac, br, bc) => pathHops(ar, ac, br, bc, r0, wc + 1, r1, c1, seed, depth + 1);
    const toGap = s < 0 ? left(sr, sc, rg, wc - 1) + 1 : s > 0 ? right(sr, sc, rg, wc + 1) + 1 : 0;
    const fromGap = e < 0 ? 1 + left(rg, wc - 1, er, ec) : e > 0 ? 1 + right(rg, wc + 1, er, ec) : 0;
    return toGap + fromGap;
  }
  const { wr, cg } = cut;
  const s = sideOf(sr, wr);
  const e = sideOf(er, wr);
  if (s === e) {
    if (s < 0) return pathHops(sr, sc, er, ec, r0, c0, wr - 1, c1, seed, depth + 1);
    if (s > 0) return pathHops(sr, sc, er, ec, wr + 1, c0, r1, c1, seed, depth + 1);
    return man(sr, sc, er, ec);
  }
  const top = (ar, ac, br, bc) => pathHops(ar, ac, br, bc, r0, c0, wr - 1, c1, seed, depth + 1);
  const bottom = (ar, ac, br, bc) => pathHops(ar, ac, br, bc, wr + 1, c0, r1, c1, seed, depth + 1);
  const toGap = s < 0 ? top(sr, sc, wr - 1, cg) + 1 : s > 0 ? bottom(sr, sc, wr + 1, cg) + 1 : 0;
  const fromGap = e < 0 ? 1 + top(wr - 1, cg, er, ec) : e > 0 ? 1 + bottom(wr + 1, cg, er, ec) : 0;
  return toGap + fromGap;
}

function collectWaypoints(sr, sc, er, ec, r0, c0, r1, c1, seed, out, depth) {
  if (sr === er && sc === ec) {
    out.push({ row: sr, col: sc });
    return;
  }
  const cut = split(r0, c0, r1, c1, seed, depth);
  if (!cut) {
    out.push({ row: sr, col: sc });
    if (sr !== er && sc !== ec) out.push({ row: sr, col: ec });
    out.push({ row: er, col: ec });
    return;
  }
  if (cut.vertical) {
    const { wc, rg } = cut;
    const s = sideOf(sc, wc);
    const e = sideOf(ec, wc);
    if (s === e && s < 0) {
      collectWaypoints(sr, sc, er, ec, r0, c0, r1, wc - 1, seed, out, depth + 1);
      return;
    }
    if (s === e && s > 0) {
      collectWaypoints(sr, sc, er, ec, r0, wc + 1, r1, c1, seed, out, depth + 1);
      return;
    }
    if (s < 0) collectWaypoints(sr, sc, rg, wc - 1, r0, c0, r1, wc - 1, seed, out, depth + 1);
    else if (s > 0) collectWaypoints(sr, sc, rg, wc + 1, r0, wc + 1, r1, c1, seed, out, depth + 1);
    else out.push({ row: sr, col: sc });
    out.push({ row: rg, col: wc });
    if (e < 0) collectWaypoints(rg, wc - 1, er, ec, r0, c0, r1, wc - 1, seed, out, depth + 1);
    else if (e > 0) collectWaypoints(rg, wc + 1, er, ec, r0, wc + 1, r1, c1, seed, out, depth + 1);
    else out.push({ row: er, col: ec });
    return;
  }
  const { wr, cg } = cut;
  const s = sideOf(sr, wr);
  const e = sideOf(er, wr);
  if (s === e && s < 0) {
    collectWaypoints(sr, sc, er, ec, r0, c0, wr - 1, c1, seed, out, depth + 1);
    return;
  }
  if (s === e && s > 0) {
    collectWaypoints(sr, sc, er, ec, wr + 1, c0, r1, c1, seed, out, depth + 1);
    return;
  }
  if (s < 0) collectWaypoints(sr, sc, wr - 1, cg, r0, c0, wr - 1, c1, seed, out, depth + 1);
  else if (s > 0) collectWaypoints(sr, sc, wr + 1, cg, wr + 1, c0, r1, c1, seed, out, depth + 1);
  else out.push({ row: sr, col: sc });
  out.push({ row: wr, col: cg });
  if (e < 0) collectWaypoints(wr - 1, cg, er, ec, r0, c0, wr - 1, c1, seed, out, depth + 1);
  else if (e > 0) collectWaypoints(wr + 1, cg, er, ec, wr + 1, c0, r1, c1, seed, out, depth + 1);
  else out.push({ row: er, col: ec });
}

export function paintVirtualPreview(ctx, maze, box) {
  const { x, y, w, h } = box;
  const end = chamberEnd(maze);
  const maxC = Math.max(1, maze.cols - 1);
  const maxR = Math.max(1, maze.rows - 1);
  const mapX = (col) => x + (col / maxC) * w;
  const mapY = (row) => y + (row / maxR) * h;
  const seed = maze.seed | 0;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#1f1f1f";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);

  function rec(r0, c0, r1, c1, depth) {
    const pw = Math.abs(mapX(c1) - mapX(c0));
    const ph = Math.abs(mapY(r1) - mapY(r0));
    if (pw < 6 && ph < 6) return;
    if (depth > 14) return;
    const cut = split(r0, c0, r1, c1, seed, depth);
    if (!cut) return;
    ctx.lineWidth = depth < 2 ? 2.6 : depth < 5 ? 1.6 : 1;
    ctx.beginPath();
    if (cut.vertical) {
      const px = mapX(cut.wc);
      const y0 = mapY(r0);
      const y1 = mapY(r1);
      const gy = mapY(cut.rg);
      const gap = Math.max(3, Math.min(10, ph * 0.045));
      ctx.moveTo(px, y0);
      ctx.lineTo(px, Math.max(y0, gy - gap));
      ctx.moveTo(px, Math.min(y1, gy + gap));
      ctx.lineTo(px, y1);
      ctx.stroke();
      rec(r0, c0, r1, cut.wc - 1, depth + 1);
      rec(r0, cut.wc + 1, r1, c1, depth + 1);
      return;
    }
    const py = mapY(cut.wr);
    const x0 = mapX(c0);
    const x1 = mapX(c1);
    const gx = mapX(cut.cg);
    const gap = Math.max(3, Math.min(10, pw * 0.045));
    ctx.moveTo(x0, py);
    ctx.lineTo(Math.max(x0, gx - gap), py);
    ctx.moveTo(Math.min(x1, gx + gap), py);
    ctx.lineTo(x1, py);
    ctx.stroke();
    rec(r0, c0, cut.wr - 1, c1, depth + 1);
    rec(cut.wr + 1, c0, r1, c1, depth + 1);
  }
  rec(1, 1, end.row, end.col, 0);

  const mark = (cell, color, label) => {
    const mx = mapX(cell.col);
    const my = mapY(cell.row);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx, my, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 11px Pretendard, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, mx, my + 0.5);
  };
  mark(maze.start, "#2563eb", "S");
  mark(maze.end, "#ea580c", "E");
}

export function runVirtualExact(maze) {
  const start = performance.now();
  const { hops, waypoints } = virtualPath(maze);
  const timeMs = performance.now() - start;
  const found = hops >= 0 && Number.isFinite(hops);
  return {
    found,
    path: found ? waypoints : [],
    pathLength: found ? hops : 0,
    pathCost: found ? hops : 0,
    visitedCount: 0,
    steps: [],
    searchMode: "virtual-division",
    virtual: true,
    timeMs,
  };
}
