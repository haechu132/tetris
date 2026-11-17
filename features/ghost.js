/*
 * NULLBLOCK 기능: 고스트 블록
 * 현재 블록을 끝까지 내렸을 때 놓일 자리를 반투명하게 미리 보여 줍니다.
 */
(() => {
  if (!window.NULLBLOCK) return;

  const COLORS = { I: '#4fc3c9', O: '#e8c547', T: '#a77bd9', S: '#6cc46a', Z: '#e06464', J: '#5b8de0', L: '#e89a4f' };
  const ALPHA = 0.22;

  function cellsOf(shape, ox, oy) {
    const out = [];
    shape.forEach((row, y) => row.forEach((v, x) => { if (v) out.push({ x: ox + x, y: oy + y }); }));
    return out;
  }

  function collides(grid, cols, rows, shape, ox, oy) {
    return cellsOf(shape, ox, oy).some(({ x, y }) =>
      x < 0 || x >= cols || y >= rows || (y >= 0 && grid[y] && grid[y][x]));
  }

  NULLBLOCK.on('draw', ({ ctx, size }) => {
    const s = NULLBLOCK.getState();
    if (!s.running || s.over || !s.piece || !s.grid) return;
    const { grid, cols, rows, piece } = s;
    if (collides(grid, cols, rows, piece.shape, piece.x, piece.y)) return;

    let gy = piece.y;
    while (!collides(grid, cols, rows, piece.shape, piece.x, gy + 1)) gy++;
    if (gy === piece.y) return; // 이미 바닥: 현재 블록과 겹치므로 그리지 않음

    const color = COLORS[piece.type] || '#ffffff';
    const own = new Set(cellsOf(piece.shape, piece.x, piece.y).map(c => c.x + ',' + c.y));

    ctx.save();
    try {
      ctx.globalAlpha = ALPHA;
      ctx.fillStyle = color;
      cellsOf(piece.shape, piece.x, gy).forEach(({ x, y }) => {
        if (y < 0 || own.has(x + ',' + y)) return;
        ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      });
    } finally {
      ctx.restore();
    }
  });
})();
