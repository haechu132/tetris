/*
 * NULLBLOCK 기능: 효과음
 *
 * 음원 파일 없이 Web Audio API로 소리를 합성합니다.
 *   - lock      : 짧은 '툭' 소리 (hardDrop 이면 더 낮고 묵직하게)
 *   - lineclear : 지운 줄 수만큼 올라가는 음, 4줄이면 반짝이는 화음 추가
 *
 * 브라우저 자동재생 제한 때문에 첫 keydown/pointerdown 때 AudioContext 를 만들고 resume 합니다.
 * AudioContext 를 지원하지 않는 환경에서는 아무 소리 없이 조용히 넘어갑니다.
 */
(() => {
  if (typeof window === 'undefined' || !window.NULLBLOCK) return;

  const AC = window.AudioContext || window.webkitAudioContext;
  let ac = null;
  let master = null;

  function unlock() {
    if (!AC) return;
    try {
      if (!ac) {
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.35;
        master.connect(ac.destination);
      }
      if (ac.state === 'suspended' && ac.resume) {
        const p = ac.resume();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (err) {
      ac = null;
      master = null;
    }
  }

  // capture 단계에서 받아 게임 쪽 핸들러보다 먼저 준비되게 함
  window.addEventListener('keydown', unlock, true);
  window.addEventListener('pointerdown', unlock, true);

  const ready = () => ac && master && ac.state === 'running';

  // 감쇠하는 단음 하나
  function tone(freq, start, dur, { type = 'sine', vol = 0.5, endFreq = null } = {}) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  // 짧은 노이즈 (부딪히는 질감)
  function noise(start, dur, vol, cutoff) {
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(start);
  }

  function playLock(hardDrop) {
    const t = ac.currentTime;
    if (hardDrop) {
      tone(140, t, 0.18, { type: 'triangle', vol: 0.7, endFreq: 55 });
      noise(t, 0.08, 0.5, 900);
    } else {
      tone(220, t, 0.07, { type: 'triangle', vol: 0.4, endFreq: 120 });
      noise(t, 0.03, 0.2, 1800);
    }
  }

  function playClear(count) {
    const t = ac.currentTime;
    const n = Math.max(1, Math.min(4, count | 0));
    const scale = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    for (let i = 0; i < n; i++) {
      tone(scale[i], t + i * 0.07, 0.18, { type: 'square', vol: 0.18 });
    }
    if (n >= 4) {
      // 4줄: 아르페지오 뒤에 반짝이는 화음과 위로 쓸어 올리는 소리
      const s = t + 4 * 0.07;
      [1046.5, 1318.5, 1568.0, 2093.0].forEach((f, i) => {
        tone(f, s + i * 0.015, 0.6, { type: 'triangle', vol: 0.16 });
      });
      tone(400, s, 0.35, { type: 'sawtooth', vol: 0.08, endFreq: 2400 });
    }
  }

  function safe(fn) {
    return (e) => {
      if (!ready()) return;
      try { fn(e || {}); } catch (err) { /* 소리 실패는 게임에 영향 주지 않음 */ }
    };
  }

  NULLBLOCK.on('lock', safe((e) => playLock(!!e.hardDrop)));
  NULLBLOCK.on('lineclear', safe((e) => playClear(e.count)));
})();
