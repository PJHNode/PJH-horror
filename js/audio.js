const Sound = (() => {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let ambient = null;
  let heartbeatTimer = null;
  let heartbeatRate = 0;
  let camStatic = null;

  function init() {
    if (ctx) { ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  function noiseSource() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    return src;
  }

  function startAmbient() {
    if (!ctx || ambient) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 4);
    out.connect(master);

    const drone1 = ctx.createOscillator();
    drone1.type = 'sawtooth';
    drone1.frequency.value = 41;
    const drone2 = ctx.createOscillator();
    drone2.type = 'sine';
    drone2.frequency.value = 43.7;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 120;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.5;
    drone1.connect(droneFilter);
    drone2.connect(droneFilter);
    droneFilter.connect(droneGain).connect(out);

    const hum = ctx.createOscillator();
    hum.type = 'square';
    hum.frequency.value = 60;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.015;
    hum.connect(humGain).connect(out);

    const air = noiseSource();
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.value = 400;
    airFilter.Q.value = 0.6;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.06;
    air.connect(airFilter).connect(airGain).connect(out);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain).connect(droneFilter.frequency);

    [drone1, drone2, hum, air, lfo].forEach(n => n.start());
    ambient = { out, nodes: [drone1, drone2, hum, air, lfo], droneFilter };
  }

  function stopAmbient() {
    if (!ambient) return;
    const a = ambient;
    ambient = null;
    a.out.gain.cancelScheduledValues(ctx.currentTime);
    a.out.gain.setValueAtTime(a.out.gain.value, ctx.currentTime);
    a.out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    setTimeout(() => a.nodes.forEach(n => n.stop()), 400);
  }

  function setTension(level) {
    if (!ambient) return;
    ambient.droneFilter.frequency.setTargetAtTime(120 + level * 500, ctx.currentTime, 1.5);
  }

  function thump(time, freq, vol) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.15);
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    osc.connect(g).connect(master);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  function setHeartbeat(bpm) {
    if (!ctx) return;
    if (bpm === heartbeatRate) return;
    heartbeatRate = bpm;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    if (!bpm) return;
    const beat = () => {
      const t = ctx.currentTime;
      thump(t, 70, 0.9);
      thump(t + 0.18, 60, 0.6);
    };
    beat();
    heartbeatTimer = setInterval(beat, 60000 / bpm);
  }

  function startCamStatic() {
    if (!ctx || camStatic) return;
    const src = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    src.connect(f).connect(g).connect(master);
    src.start();
    camStatic = { src, g };
  }

  function stopCamStatic() {
    if (!camStatic) return;
    camStatic.src.stop();
    camStatic = null;
  }

  function staticBurst(duration = 0.35, vol = 0.4) {
    if (!ctx) return;
    const src = noiseSource();
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(g).connect(master);
    src.start(t);
    src.stop(t + duration);
  }

  function click() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1800;
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  function doorSlam() {
    if (!ctx) return;
    const t = ctx.currentTime;
    thump(t, 110, 1);
    const src = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + 0.4);
  }

  function denied() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 90;
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  // pan: -1 = left, 1 = right, 0 = centre
  function footsteps(pan = 0, count = 3) {
    if (!ctx) return;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(master);
    for (let i = 0; i < count; i++) {
      const t = ctx.currentTime + i * 0.55 + Math.random() * 0.1;
      const src = noiseSource();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 300;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      src.connect(f).connect(g).connect(panner);
      src.start(t);
      src.stop(t + 0.2);
    }
  }

  function breathing(pan = 0) {
    if (!ctx) return;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(master);
    for (let i = 0; i < 2; i++) {
      const t = ctx.currentTime + i * 1.6;
      const src = noiseSource();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(500, t);
      f.frequency.linearRampToValueAtTime(900, t + 0.8);
      f.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.5);
      g.gain.linearRampToValueAtTime(0.0001, t + 1.3);
      src.connect(f).connect(g).connect(panner);
      src.start(t);
      src.stop(t + 1.4);
    }
  }

  function scrape(pan = 0) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(master);
    const src = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 8;
    f.frequency.setValueAtTime(1200, t);
    f.frequency.linearRampToValueAtTime(2600, t + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.3);
    src.connect(f).connect(g).connect(panner);
    src.start(t);
    src.stop(t + 1.4);
  }

  function whisper(pan = 0) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(master);
    for (let i = 0; i < 5; i++) {
      const st = t + i * 0.22 + Math.random() * 0.1;
      const src = noiseSource();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2500 + Math.random() * 3000;
      f.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.25, st + 0.05);
      g.gain.linearRampToValueAtTime(0.0001, st + 0.18);
      src.connect(f).connect(g).connect(panner);
      src.start(st);
      src.stop(st + 0.2);
    }
  }

  function knock(pan = 0, count = 3, vol = 0.45, gap = 0.28) {
    if (!ctx) return;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const g = ctx.createGain();
    g.gain.value = vol;
    panner.connect(g).connect(master);
    Array.from({ length: count }, (_, i) => i * gap + Math.random() * 0.05).forEach(off => {
      const t = ctx.currentTime + off;
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
      og.gain.setValueAtTime(0.8, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(og).connect(panner);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  }

  function scream() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(1.4, t);
    out.gain.linearRampToValueAtTime(1.2, t + 1.2);
    out.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = i / 512 - 1;
      curve[i] = Math.tanh(x * 8);
    }
    shaper.curve = curve;
    shaper.connect(out).connect(master);

    [220, 311, 466, 587].forEach((base, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(base * 0.6, t);
      osc.frequency.exponentialRampToValueAtTime(base * 2.2, t + 0.12);
      osc.frequency.linearRampToValueAtTime(base * 1.7, t + 2);
      const vib = ctx.createOscillator();
      vib.frequency.value = 9 + i * 3;
      const vibGain = ctx.createGain();
      vibGain.gain.value = base * 0.15;
      vib.connect(vibGain).connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.25;
      osc.connect(g).connect(shaper);
      osc.start(t); vib.start(t);
      osc.stop(t + 2.3); vib.stop(t + 2.3);
    });

    const n = noiseSource();
    const ng = ctx.createGain();
    ng.gain.value = 0.6;
    n.connect(ng).connect(shaper);
    n.start(t);
    n.stop(t + 2.3);
  }

  function powerDown() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(20, t + 2.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 2.7);
  }

  // An out-of-tune music-box melody. wobble = random detune per note.
  function musicBox(duration, { vol = 0.18, interval = 420, wobble = 0.03, pan = 0 } = {}) {
    if (!ctx) return () => {};
    const notes = [659, 587, 523, 494, 523, 440, 392, 440, 494, 523, 494, 440];
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(master);
    let i = 0;
    const timer = setInterval(() => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = notes[i % notes.length] * (1 + (Math.random() - 0.5) * wobble);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(g).connect(panner);
      osc.start(t);
      osc.stop(t + 0.65);
      i++;
    }, interval);
    const stopTimer = setTimeout(() => clearInterval(timer), duration);
    return () => { clearInterval(timer); clearTimeout(stopTimer); };
  }

  function chime() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 0.9, 1.8, 2.7, 3.6, 4.5].forEach(off => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 880;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.3, t + off);
      g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.85);
      osc.connect(g).connect(master);
      osc.start(t + off);
      osc.stop(t + off + 0.9);
    });
  }

  const clips = {};
  let scareClip = null;
  let scareTimer = null;

  function preloadClips(srcs) {
    srcs.forEach(src => {
      if (clips[src]) return;
      const a = new Audio(src);
      a.preload = 'auto';
      clips[src] = a;
    });
  }

  // Plays one of the clips at random, cut off after maxMs; falls back to the synthesized scream.
  function playScare(srcs, maxMs) {
    stopScare();
    preloadClips(srcs);
    const a = clips[srcs[Math.floor(Math.random() * srcs.length)]];
    scareClip = a;
    a.currentTime = 0;
    a.volume = 1;
    a.play().catch(() => { if (scareClip === a) scream(); });
    scareTimer = setTimeout(stopScare, maxMs);
  }

  function stopScare() {
    clearTimeout(scareTimer);
    if (scareClip) scareClip.pause();
    scareClip = null;
  }

  let track = null;
  let trackFade = null;

  function fadeTrack(target, ms, done) {
    clearInterval(trackFade);
    const a = track;
    const steps = Math.max(1, Math.round(ms / 50));
    const delta = (target - a.volume) / steps;
    let i = 0;
    trackFade = setInterval(() => {
      i++;
      a.volume = Math.min(1, Math.max(0, a.volume + delta));
      if (i >= steps) {
        clearInterval(trackFade);
        a.volume = target;
        if (done) done();
      }
    }, 50);
  }

  function startTrack(src, volume = 0.6, fadeMs = 4000) {
    if (track) return;
    track = new Audio(src);
    track.loop = true;
    track.volume = 0;
    track.play().catch(() => {});
    fadeTrack(volume, fadeMs);
  }

  function stopTrack(fadeMs = 0) {
    if (!track) return;
    const a = track;
    const end = () => { a.pause(); if (track === a) track = null; };
    if (fadeMs > 0) fadeTrack(0, fadeMs, end);
    else { clearInterval(trackFade); end(); }
  }

  let stareNodes = null;

  // A ringing whine that climbs as level goes 0 -> 1.
  function stare(level) {
    if (!ctx) return;
    if (!stareNodes) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      osc2.connect(g);
      g.connect(master);
      osc.start();
      osc2.start();
      stareNodes = { osc, osc2, g };
    }
    const t = ctx.currentTime;
    const f = 900 + level * 2600;
    stareNodes.osc.frequency.setTargetAtTime(f, t, 0.05);
    stareNodes.osc2.frequency.setTargetAtTime(f * 1.013, t, 0.05);
    stareNodes.g.gain.setTargetAtTime(0.03 + level * 0.22, t, 0.05);
  }

  function stopStare() {
    if (!stareNodes) return;
    stareNodes.osc.stop();
    stareNodes.osc2.stop();
    stareNodes = null;
  }

  function stopAll() {
    stopStare();
    stopTrack();
    stopAmbient();
    stopCamStatic();
    setHeartbeat(0);
  }

  return {
    init, startAmbient, stopAmbient, setTension, setHeartbeat,
    startCamStatic, stopCamStatic, staticBurst, click, doorSlam, denied,
    footsteps, breathing, scrape, whisper, knock, scream, powerDown, musicBox, chime,
    startTrack, stopTrack, preloadClips, playScare, stopScare, stare, stopStare, stopAll,
  };
})();
