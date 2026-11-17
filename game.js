/*
 * NULLBLOCK — 게임 본체
 *
 * 기능 확장: game.js 다음에 불러온 파일에서 이벤트를 구독하세요.
 *
 *   NULLBLOCK.on('lineclear', e => console.log(e.count + '줄 지움'));
 *
 * 이벤트 이름          | 언제                         | 전달 값
 * ---------------------|------------------------------|-------------------------------------------
 * start                | 새 게임 시작                 | {}
 * spawn                | 새 블록 등장                 | { type, next }
 * move                 | 좌우/아래 이동 성공          | { dx, dy, x, y }
 * rotate               | 회전 성공                    | { dir }
 * lock                 | 블록이 바닥에 놓임           | { type, cells: [{x, y}], hardDrop }
 * lineclear            | 줄이 지워짐 (lock 직후)      | { rows: [y...], count, points }
 * score                | 점수 변경                    | { score, delta }
 * levelup              | 레벨 상승                    | { level }
 * pause / resume       | 일시정지 / 계속              | {}
 * gameover             | 꼭대기에 닿아 게임 종료      | { score, lines, level }
 *
 * 그 외: NULLBLOCK.off(name, fn), NULLBLOCK.getState()
 */
(() => {
  const COLS = 10, ROWS = 20, SIZE = 30;

  // ---------- 이벤트 ----------
  const listeners = {};
  function on(name, fn) { (listeners[name] ||= []).push(fn); return () => off(name, fn); }
  function off(name, fn) { listeners[name] = (listeners[name] || []).filter(f => f !== fn); }
  function emit(name, detail = {}) {
    for (const fn of listeners[name] || []) {
      try { fn(detail); } catch (err) { console.error(`[NULLBLOCK] '${name}' 처리 중 오류:`, err); }
    }
  }

  // ---------- 화면 요소 ----------
  const board = document.getElementById('board');
  const ctx = board.getContext('2d');
  const nextCtx = document.getElementById('next').getContext('2d');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('start');
  const pauseBtn = document.getElementById('pause');

  const SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
  };
  const COLORS = { I:'#4fc3c9', O:'#e8c547', T:'#a77bd9', S:'#6cc46a', Z:'#e06464', J:'#5b8de0', L:'#e89a4f' };

  let grid, piece, nextType, bag, score, lines, level, dropInterval, dropTimer, lastTime, running, paused, over;

  const newGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  function takeFromBag() {
    if (!bag.length) {
      bag = Object.keys(SHAPES);
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    }
    return bag.pop();
  }

  function cellsOf(shape, ox, oy) {
    const out = [];
    shape.forEach((row, y) => row.forEach((v, x) => { if (v) out.push({ x: ox + x, y: oy + y }); }));
    return out;
  }

  function collides(shape, ox, oy) {
    return cellsOf(shape, ox, oy).some(({ x, y }) =>
      x < 0 || x >= COLS || y >= ROWS || (y >= 0 && grid[y][x]));
  }

  function spawn() {
    const type = nextType;
    nextType = takeFromBag();
    const shape = SHAPES[type].map(r => r.slice());
    piece = { type, shape, x: Math.floor((COLS - shape[0].length) / 2), y: type === 'I' ? -1 : 0 };
    drawNext();
    if (collides(piece.shape, piece.x, piece.y)) { gameOver(); return; }  // 쌓인 블록이 꼭대기에 닿음
    emit('spawn', { type, next: nextType });
  }

  function rotate(shape, dir) {
    const n = shape.length;
    const r = Array.from({ length: n }, () => Array(n).fill(0));
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if (dir > 0) r[x][n - 1 - y] = shape[y][x];
        else r[n - 1 - x][y] = shape[y][x];
    return r;
  }

  function tryRotate(dir) {
    if (piece.type === 'O') return;
    const r = rotate(piece.shape, dir);
    for (const [dx, dy] of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1]]) {
      if (!collides(r, piece.x + dx, piece.y + dy)) {
        piece.shape = r; piece.x += dx; piece.y += dy;
        emit('rotate', { dir });
        return;
      }
    }
  }

  function move(dx, dy) {
    if (collides(piece.shape, piece.x + dx, piece.y + dy)) return false;
    piece.x += dx; piece.y += dy;
    emit('move', { dx, dy, x: piece.x, y: piece.y });
    return true;
  }

  function addScore(delta) {
    if (!delta) return;
    score += delta;
    updateStats();
    emit('score', { score, delta });
  }

  function lock(hardDrop = false) {
    const cells = cellsOf(piece.shape, piece.x, piece.y);
    // 보드 위쪽 밖에 걸친 채로 놓이면 게임 오버
    if (cells.some(c => c.y < 0)) { gameOver(); return; }
    cells.forEach(({ x, y }) => { grid[y][x] = piece.type; });
    emit('lock', { type: piece.type, cells, hardDrop });
    clearLines();
    if (!over) spawn();
  }

  function clearLines() {
    const rows = [];
    for (let y = 0; y < ROWS; y++) if (grid[y].every(c => c)) rows.push(y);
    if (!rows.length) return;

    grid = grid.filter((_, y) => !rows.includes(y));
    while (grid.length < ROWS) grid.unshift(Array(COLS).fill(null));

    const points = [0, 100, 300, 500, 800][rows.length] * level;
    lines += rows.length;
    emit('lineclear', { rows, count: rows.length, points });
    addScore(points);

    const newLevel = Math.floor(lines / 10) + 1;
    if (newLevel > level) {
      level = newLevel;
      dropInterval = Math.max(80, 800 - (level - 1) * 70);
      updateStats();
      emit('levelup', { level });
    }
    updateStats();
  }

  function softDrop() {
    if (move(0, 1)) addScore(1);
    else lock();
    dropTimer = 0;
  }

  function hardDrop() {
    let d = 0;
    while (move(0, 1)) d++;
    addScore(d * 2);
    lock(true);
    dropTimer = 0;
  }

  function ghostY() {
    let y = piece.y;
    while (!collides(piece.shape, piece.x, y + 1)) y++;
    return y;
  }

  // ---------- 그리기 ----------
  function drawCell(c, x, y, color, size, alpha = 1) {
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(x * size + 1, y * size + 1, size - 2, 4);
    c.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, board.width, board.height);
    ctx.strokeStyle = '#262a33';
    for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * SIZE, 0); ctx.lineTo(x * SIZE, ROWS * SIZE); ctx.stroke(); }
    for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * SIZE); ctx.lineTo(COLS * SIZE, y * SIZE); ctx.stroke(); }

    grid.forEach((row, y) => row.forEach((t, x) => { if (t) drawCell(ctx, x, y, COLORS[t], SIZE); }));

    if (piece && !over) {
      const gy = ghostY();
      cellsOf(piece.shape, piece.x, gy).forEach(({ x, y }) => { if (y >= 0) drawCell(ctx, x, y, COLORS[piece.type], SIZE, 0.2); });
      cellsOf(piece.shape, piece.x, piece.y).forEach(({ x, y }) => { if (y >= 0) drawCell(ctx, x, y, COLORS[piece.type], SIZE); });
    }
  }

  function drawNext() {
    nextCtx.clearRect(0, 0, 120, 90);
    const s = SHAPES[nextType], size = 22;
    const rows = s.filter(r => r.some(v => v));
    const w = s[0].length * size, h = rows.length * size;
    nextCtx.save();
    nextCtx.translate((120 - w) / 2, (90 - h) / 2);
    rows.forEach((row, y) => row.forEach((v, x) => { if (v) drawCell(nextCtx, x, y, COLORS[nextType], size); }));
    nextCtx.restore();
  }

  function updateStats() {
    document.getElementById('score').textContent = score;
    document.getElementById('lines').textContent = lines;
    document.getElementById('level').textContent = level;
  }

  function showOverlay(html) { overlay.innerHTML = html; overlay.style.display = html ? 'flex' : 'none'; }

  // ---------- 진행 ----------
  function gameOver() {
    over = true; running = false;
    pauseBtn.disabled = true;
    startBtn.textContent = '다시 시작';
    showOverlay(`<div>게임 오버<small>점수 ${score}</small></div>`);
    emit('gameover', { score, lines, level });
  }

  function start() {
    grid = newGrid(); bag = [];
    score = 0; lines = 0; level = 1; dropInterval = 800; dropTimer = 0;
    over = false; paused = false; running = true;
    updateStats();
    showOverlay('');
    startBtn.textContent = '다시 시작';
    pauseBtn.disabled = false; pauseBtn.textContent = '일시정지';
    lastTime = performance.now();
    emit('start');
    nextType = takeFromBag();
    spawn();
  }

  function togglePause(force) {
    if (!running) return;
    const next = force === undefined ? !paused : force;
    if (next === paused) return;
    paused = next;
    showOverlay(paused ? '<div>일시정지<small>P 또는 Esc로 계속</small></div>' : '');
    pauseBtn.textContent = paused ? '계속하기' : '일시정지';
    if (!paused) lastTime = performance.now();
    emit(paused ? 'pause' : 'resume');
  }

  function loop(t) {
    const dt = t - (lastTime || t);
    lastTime = t;
    if (running && !paused) {
      dropTimer += dt;
      if (dropTimer >= dropInterval) {
        if (!move(0, 1)) lock();
        dropTimer = 0;
      }
    }
    if (grid) draw();
    requestAnimationFrame(loop);
  }

  document.addEventListener('keydown', e => {
    if (!running) return;
    if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
    if (paused) return;
    switch (e.code) {
      case 'ArrowLeft': move(-1, 0); break;
      case 'ArrowRight': move(1, 0); break;
      case 'ArrowDown': softDrop(); break;
      case 'ArrowUp': case 'KeyX': tryRotate(1); break;
      case 'KeyZ': tryRotate(-1); break;
      case 'Space': hardDrop(); break;
      default: return;
    }
    e.preventDefault();
  });

  pauseBtn.addEventListener('click', e => { e.target.blur(); togglePause(); });
  startBtn.addEventListener('click', e => { e.target.blur(); start(); });
  window.addEventListener('blur', () => { if (running && !paused) togglePause(true); });

  // ---------- 바깥에 공개 ----------
  window.NULLBLOCK = {
    on, off,
    getState: () => ({
      cols: COLS, rows: ROWS, score, lines, level, running, paused, over,
      grid: grid.map(r => r.slice()),
      piece: piece && { type: piece.type, x: piece.x, y: piece.y },
      next: nextType,
    }),
  };

  grid = newGrid();
  score = 0; lines = 0; level = 1;
  showOverlay('<div>NULLBLOCK<small>시작 버튼을 누르세요</small></div>');
  requestAnimationFrame(loop);
})();
