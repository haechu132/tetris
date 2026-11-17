/*
 * NULLBLOCK — 블록 퍼즐 게임 본체
 *
 * 기능 확장 방법: 새 파일(예: features/sound.js)을 만들고 index.html에서
 * game.js 아래에 <script>로 붙인 뒤, 아래처럼 이벤트를 구독하세요.
 *
 *   NULLBLOCK.on('lineClear', e => console.log(e.count + '줄 지움'));
 *
 * 이벤트 목록 (핸들러에 넘어오는 값)
 *   start      { }                                  새 게임 시작
 *   spawn      { type, next }                       새 블록 등장
 *   move       { dx, dy }                           블록 이동 성공
 *   rotate     { dir }                              블록 회전 성공 (1: 시계, -1: 반시계)
 *   hardDrop   { distance }                         스페이스로 바로 떨어뜨림
 *   lock       { type, cells: [{x,y}] }             블록이 바닥에 놓임
 *   lineClear  { count, rows: [y...], lines, level } 줄이 지워짐 (rows는 지우기 전 행 번호)
 *   score      { score, delta }                     점수 변경
 *   levelUp    { level }                            레벨 상승
 *   pause      { paused }                           일시정지 / 재개
 *   gameOver   { score, lines, level }              게임 오버
 *   draw       { ctx, size }                        매 프레임 그린 직후 (보드 위에 덧그리기용)
 *
 * NULLBLOCK.state 로 현재 상태(grid, piece, score 등)를 읽을 수 있습니다.
 */
(function () {
  'use strict';

  // ---------- 이벤트 버스 ----------
  const listeners = {};
  function on(name, fn) { (listeners[name] ||= []).push(fn); return () => off(name, fn); }
  function off(name, fn) { listeners[name] = (listeners[name] || []).filter(f => f !== fn); }
  function emit(name, detail = {}) {
    for (const fn of listeners[name] || []) {
      try { fn(detail); } catch (err) { console.error(`[NULLBLOCK] '${name}' 핸들러 오류:`, err); }
    }
  }

  // ---------- 설정 ----------
  const COLS = 10, ROWS = 20, SIZE = 30;
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
  const LINE_SCORES = [0, 100, 300, 500, 800];

  // ---------- DOM ----------
  const board = document.getElementById('board');
  const ctx = board.getContext('2d');
  const nextCtx = document.getElementById('next').getContext('2d');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('start');
  const pauseBtn = document.getElementById('pause');

  // ---------- 상태 ----------
  const S = {
    grid: null, piece: null, nextType: null, bag: [],
    score: 0, lines: 0, level: 1,
    dropInterval: 800, dropTimer: 0, lastTime: 0,
    running: false, paused: false, over: false,
  };

  const newGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  function takeFromBag() {
    if (!S.bag.length) {
      S.bag = Object.keys(SHAPES);
      for (let i = S.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [S.bag[i], S.bag[j]] = [S.bag[j], S.bag[i]];
      }
    }
    return S.bag.pop();
  }

  function collides(shape, ox, oy) {
    for (let y = 0; y < shape.length; y++)
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        const nx = ox + x, ny = oy + y;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && S.grid[ny][nx]) return true;
      }
    return false;
  }

  function pieceCells(p = S.piece) {
    const cells = [];
    p.shape.forEach((row, y) => row.forEach((v, x) => { if (v) cells.push({ x: p.x + x, y: p.y + y }); }));
    return cells;
  }

  function spawn() {
    const type = S.nextType;
    S.nextType = takeFromBag();
    const shape = SHAPES[type].map(r => r.slice());
    S.piece = { type, shape, x: Math.floor((COLS - shape[0].length) / 2), y: type === 'I' ? -1 : 0 };
    drawNext();
    // 새 블록이 나올 자리가 막혀 있으면 = 꼭대기에 닿음
    if (collides(S.piece.shape, S.piece.x, S.piece.y)) { gameOver(); return; }
    emit('spawn', { type, next: S.nextType });
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
    const p = S.piece;
    if (p.type === 'O') return false;
    const r = rotate(p.shape, dir);
    for (const [dx, dy] of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1]]) {
      if (!collides(r, p.x + dx, p.y + dy)) {
        p.shape = r; p.x += dx; p.y += dy;
        emit('rotate', { dir });
        return true;
      }
    }
    return false;
  }

  function move(dx, dy, silent) {
    if (collides(S.piece.shape, S.piece.x + dx, S.piece.y + dy)) return false;
    S.piece.x += dx; S.piece.y += dy;
    if (!silent) emit('move', { dx, dy });
    return true;
  }

  function addScore(delta) {
    if (!delta) return;
    S.score += delta;
    updateStats();
    emit('score', { score: S.score, delta });
  }

  function lock() {
    const p = S.piece;
    const cells = pieceCells(p);
    for (const c of cells) if (c.y >= 0) S.grid[c.y][c.x] = p.type;
    emit('lock', { type: p.type, cells });
    // 보드 위로 삐져나온 채 놓이면 = 꼭대기에 닿음
    if (cells.some(c => c.y < 0)) { gameOver(); return; }
    clearLines();
    spawn();
  }

  function clearLines() {
    const rows = [];
    for (let y = 0; y < ROWS; y++) if (S.grid[y].every(c => c)) rows.push(y);
    if (!rows.length) return;

    S.grid = S.grid.filter((_, y) => !rows.includes(y));
    while (S.grid.length < ROWS) S.grid.unshift(Array(COLS).fill(null));

    const prevLevel = S.level;
    S.lines += rows.length;
    S.level = Math.floor(S.lines / 10) + 1;
    S.dropInterval = Math.max(80, 800 - (S.level - 1) * 70);

    emit('lineClear', { count: rows.length, rows, lines: S.lines, level: S.level });
    addScore(LINE_SCORES[rows.length] * prevLevel);
    if (S.level > prevLevel) emit('levelUp', { level: S.level });
    updateStats();
  }

  function softDrop() {
    if (move(0, 1)) addScore(1);
    else lock();
    S.dropTimer = 0;
  }

  function hardDrop() {
    let d = 0;
    while (move(0, 1, true)) d++;
    emit('hardDrop', { distance: d });
    addScore(d * 2);
    lock();
    S.dropTimer = 0;
  }

  function ghostY() {
    let y = S.piece.y;
    while (!collides(S.piece.shape, S.piece.x, y + 1)) y++;
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

    S.grid.forEach((row, y) => row.forEach((t, x) => { if (t) drawCell(ctx, x, y, COLORS[t], SIZE); }));

    if (S.piece && !S.over) {
      const gy = ghostY(), color = COLORS[S.piece.type];
      for (const c of pieceCells({ ...S.piece, y: gy })) if (c.y >= 0) drawCell(ctx, c.x, c.y, color, SIZE, 0.2);
      for (const c of pieceCells()) if (c.y >= 0) drawCell(ctx, c.x, c.y, color, SIZE);
    }
    emit('draw', { ctx, size: SIZE });
  }

  function drawNext() {
    nextCtx.clearRect(0, 0, 120, 90);
    const s = SHAPES[S.nextType], size = 22;
    const rows = s.filter(r => r.some(v => v));
    const w = s[0].length * size, h = rows.length * size;
    nextCtx.save();
    nextCtx.translate((120 - w) / 2, (90 - h) / 2);
    rows.forEach((row, y) => row.forEach((v, x) => { if (v) drawCell(nextCtx, x, y, COLORS[S.nextType], size); }));
    nextCtx.restore();
  }

  function updateStats() {
    document.getElementById('score').textContent = S.score;
    document.getElementById('lines').textContent = S.lines;
    document.getElementById('level').textContent = S.level;
  }

  function showOverlay(title, sub) {
    overlay.innerHTML = title ? `<div>${title}</div>${sub ? `<small>${sub}</small>` : ''}` : '';
    overlay.style.display = title ? 'flex' : 'none';
  }

  // ---------- 게임 흐름 ----------
  function gameOver() {
    S.over = true; S.running = false;
    pauseBtn.disabled = true;
    startBtn.textContent = '다시 시작';
    showOverlay('게임 오버', '점수 ' + S.score);
    emit('gameOver', { score: S.score, lines: S.lines, level: S.level });
  }

  function start() {
    Object.assign(S, {
      grid: newGrid(), bag: [], score: 0, lines: 0, level: 1,
      dropInterval: 800, dropTimer: 0, over: false, paused: false, running: true,
    });
    S.nextType = takeFromBag();
    updateStats();
    showOverlay('');
    startBtn.textContent = '다시 시작';
    pauseBtn.disabled = false; pauseBtn.textContent = '일시정지';
    S.lastTime = performance.now();
    emit('start');
    spawn();
  }

  function togglePause(force) {
    if (!S.running) return;
    S.paused = force === undefined ? !S.paused : force;
    showOverlay(S.paused ? '일시정지' : '', 'P 또는 Esc로 계속');
    pauseBtn.textContent = S.paused ? '계속하기' : '일시정지';
    if (!S.paused) S.lastTime = performance.now();
    emit('pause', { paused: S.paused });
  }

  function loop(t) {
    const dt = t - (S.lastTime || t);
    S.lastTime = t;
    if (S.running && !S.paused) {
      S.dropTimer += dt;
      if (S.dropTimer >= S.dropInterval) {
        if (!move(0, 1, true)) lock();
        S.dropTimer = 0;
      }
    }
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- 입력 ----------
  document.addEventListener('keydown', e => {
    if (!S.running) return;
    if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
    if (S.paused) return;
    switch (e.code) {
      case 'ArrowLeft':  move(-1, 0); break;
      case 'ArrowRight': move(1, 0); break;
      case 'ArrowDown':  softDrop(); break;
      case 'ArrowUp': case 'KeyX': tryRotate(1); break;
      case 'KeyZ':       tryRotate(-1); break;
      case 'Space':      hardDrop(); break;
      default: return;
    }
    e.preventDefault();
  });

  pauseBtn.addEventListener('click', e => { e.target.blur(); togglePause(); });
  startBtn.addEventListener('click', e => { e.target.blur(); start(); });
  window.addEventListener('blur', () => { if (S.running && !S.paused) togglePause(true); });

  // ---------- 외부 공개 API ----------
  window.NULLBLOCK = {
    on, off, emit,
    state: S,
    COLS, ROWS, SIZE, COLORS,
    start, togglePause,
  };

  S.grid = newGrid();
  showOverlay('NULLBLOCK', '시작 버튼을 누르세요');
  requestAnimationFrame(loop);
})();
