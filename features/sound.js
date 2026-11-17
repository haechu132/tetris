/*
 * NULLBLOCK — 효과음
 *
 * 음원 파일 없이 Web Audio API로 소리를 직접 만듭니다.
 *   - lock      : 블록이 바닥에 놓일 때 "툭" (바로 떨어뜨리면 조금 더 묵직하게)
 *   - lineclear : 줄이 지워질 때 올라가는 화음 (지운 줄 수만큼 음이 늘어남)
 */
(() => {
  let ac = null;

  // 브라우저는 사용자 입력이 있어야 소리를 낼 수 있으므로 첫 입력 때 준비합니다.
  function audio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  ['keydown', 'pointerdown'].forEach(ev => window.addEventListener(ev, audio, { once: true }));

  function tone({ freq, endFreq = freq, type = 'square', start = 0, dur = 0.1, vol = 0.15 }) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + start;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  NULLBLOCK.on('lock', ({ hardDrop }) => {
    tone({ freq: hardDrop ? 180 : 240, endFreq: 70, type: 'triangle', dur: hardDrop ? 0.14 : 0.09, vol: hardDrop ? 0.35 : 0.25 });
  });

  NULLBLOCK.on('lineclear', ({ count }) => {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // 도 미 솔 (높은)도
    for (let i = 0; i < count; i++) {
      tone({ freq: notes[i], type: 'square', start: 0.05 + i * 0.07, dur: 0.15, vol: 0.1 });
    }
    if (count === 4) tone({ freq: 1046.5, endFreq: 2093, type: 'sawtooth', start: 0.35, dur: 0.3, vol: 0.08 });
  });
})();
