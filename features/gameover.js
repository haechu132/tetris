/*
 * NULLBLOCK — 게임 오버 화면과 최고 점수 저장
 *
 * - gameover 이벤트에서 #overlay 에 '게임 오버', 이번 점수, 최고 점수를 보여줍니다.
 *   새 기록이면 '새 최고 기록!' 을 함께 표시합니다. (start 시 game.js 가 overlay 를 비움)
 * - 최고 점수는 localStorage 'nullblock.best' 에 저장합니다. 저장소가 막혀 있어도
 *   이 세션 동안은 메모리에서 최고 점수를 유지하며 게임은 정상 동작합니다.
 * - 사이드 패널에 '최고' 점수 상자를 추가하고 시작 시와 기록 갱신 시 갱신합니다.
 */
(() => {
  if (!window.NULLBLOCK) return;

  const KEY = 'nullblock.best';

  function loadBest() {
    try {
      const n = parseInt(window.localStorage.getItem(KEY), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (err) {
      return 0;
    }
  }

  function saveBest(n) {
    try { window.localStorage.setItem(KEY, String(n)); } catch (err) { /* 저장 불가: 메모리 값만 유지 */ }
  }

  let best = loadBest();

  // ---------- 스타일 ----------
  const style = document.createElement('style');
  style.textContent =
    '#overlay .nbGameOver{display:flex;flex-direction:column;align-items:center;gap:4px}' +
    '#overlay .nbGameOver .nbRecord{color:#ffd23d;font-size:18px;margin-top:4px}' +
    '#overlay .nbGameOver .nbHint{color:#8a90a0;font-size:13px;margin-top:10px}';
  document.head.appendChild(style);

  // ---------- 사이드 패널 '최고' 상자 ----------
  let bestValue = null;
  const levelEl = document.getElementById('level');
  const levelBox = levelEl && levelEl.closest('.box');
  if (levelBox && levelBox.parentNode) {
    const box = document.createElement('div');
    box.className = 'box';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = '최고';
    bestValue = document.createElement('div');
    bestValue.className = 'value';
    bestValue.id = 'best';
    box.appendChild(label);
    box.appendChild(bestValue);
    levelBox.parentNode.insertBefore(box, levelBox.nextSibling);
  }

  function showBest() { if (bestValue) bestValue.textContent = best; }
  showBest();

  // ---------- 이벤트 ----------
  NULLBLOCK.on('start', () => {
    best = Math.max(best, loadBest()); // 다른 탭에서 갱신됐을 수도 있음
    showBest();
  });

  NULLBLOCK.on('gameover', ({ score = 0 }) => {
    const isRecord = score > best;
    if (isRecord) {
      best = score;
      saveBest(best);
      showBest();
    }

    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    const wrap = document.createElement('div');
    wrap.className = 'nbGameOver';
    const line = (text, cls) => {
      const el = document.createElement(cls ? 'small' : 'div');
      if (cls) el.className = cls;
      el.textContent = text;
      wrap.appendChild(el);
    };
    line('게임 오버');
    line('점수 ' + score, 'nbScore');
    line('최고 ' + best, 'nbBest');
    if (isRecord) line('새 최고 기록!', 'nbRecord');
    line("'다시 시작' 버튼을 눌러 새 게임을 시작하세요", 'nbHint');

    overlay.textContent = '';
    overlay.appendChild(wrap);
    overlay.style.display = 'flex';
  });
})();
