const HOUR_SECONDS = 60;
const LAST_NIGHT = 5;
const SAVE_KEY = 'pjh-horror-night';
const MUSIC_HOUR = 3;
const MUSIC_SRC = 'assets/audio/music.m4a';
const SCARE_SOUNDS = ['assets/audio/jump1.mp3', 'assets/audio/jump2.mp3'];
const SCARE_SOUND_MAX_MS = 4000;

const $ = id => document.getElementById(id);

const ui = {
  screens: ['start-screen', 'game-screen', 'night-complete-screen', 'game-over-screen', 'win-screen', 'jumpscare-overlay'],
  powerValue: $('power-value'),
  powerDisplay: $('power-display'),
  timeValue: $('time-value'),
  nightValue: $('night-value'),
  monitor: $('monitor'),
  camFeed: $('camera-feed'),
  camStatic: $('camera-static'),
  camLabel: $('camera-label'),
  camMap: $('cam-map'),
  camNoSignal: $('camera-nosignal'),
  officePan: $('office-pan'),
  fakeScare: $('fake-scare'),
  fakeScareImg: $('fake-scare-img'),
  timeDisplay: $('time-display'),
  windPanel: $('wind-panel'),
  windFill: $('wind-fill'),
  windBtn: $('wind-btn'),
  officeDark: $('office-dark'),
  darkEyes: $('dark-eyes'),
  powerWarning: $('power-warning'),
  hallucination: $('hallucination'),
  jumpscare: $('jumpscare-overlay'),
  jumpscareImg: $('jumpscare-img'),
  doors: { left: $('left-door'), right: $('right-door') },
  doorBtns: { left: $('left-door-btn'), right: $('right-door-btn') },
  lightBtns: { left: $('left-light-btn'), right: $('right-light-btn'), vent: $('vent-btn') },
  windows: { left: $('left-window'), right: $('right-window'), vent: $('vent-window') },
  figures: { left: $('left-figure'), right: $('right-figure'), vent: $('vent-figure') },
};

let night = loadNight();
let state = null;
let monsters = [];
let scareImages = {};
let lastFrame = 0;
let mouseX = null;
let panKey = 0;
let windHeld = false;

const PAN_EDGE = 0.22;
const PAN_SPEED = 1.4;
const SIDE_VISIBLE = 0.3;

function loadNight() {
  try {
    const n = parseInt(localStorage.getItem(SAVE_KEY), 10);
    return n >= 1 && n <= LAST_NIGHT ? n : 1;
  } catch { return 1; }
}
function saveNight(n) {
  try { localStorage.setItem(SAVE_KEY, String(n)); } catch {}
}

function show(id) {
  ui.screens.forEach(s => $(s).classList.toggle('hidden', s !== id));
}

function rand(min, max) { return min + Math.random() * (max - min); }

/* ---------------- setup ---------------- */

function buildMap() {
  const rect = ([x, y, w, h], cls) => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  const buttons = CAMERAS.map(cam => {
    const [x, y] = cam.btn;
    return `<g class="map-cam" data-cam="${cam.id}">` +
      `<rect x="${x}" y="${y}" width="31" height="16" rx="2"/>` +
      `<text x="${x + 15.5}" y="${y + 11.5}">CAM${cam.short}</text></g>`;
  }).join('');
  ui.camMap.innerHTML =
    `<svg viewBox="${MAP_VIEWBOX}">` +
    MAP_ROOMS.map(r => rect(r, 'map-room')).join('') +
    `<path class="map-duct" d="${MAP_DUCT}"/>` +
    rect(MAP_OFFICE, 'map-room map-office') +
    `<text class="map-you" x="${MAP_OFFICE[0] + MAP_OFFICE[2] / 2}" y="${MAP_OFFICE[1] + 32}">YOU</text>` +
    buttons +
    `</svg>`;
  ui.camMap.addEventListener('click', e => {
    const btn = e.target.closest('.map-cam');
    if (btn) switchCam(btn.dataset.cam);
  });
}

async function preloadScares() {
  const names = [...MONSTER_DEFS.map(m => m.id), DOLL.id, PORTRAIT.id, 'entity'];
  const urls = await Promise.all(names.map(n => Placeholder.resolve(n)));
  names.forEach((n, i) => { scareImages[n] = urls[i]; });
  Object.values(scareImages).forEach(src => { new Image().src = src; });
}

const monsterImages = {};
const roomImages = {};
const photoAnomalies = [];

async function loadArt() {
  await Promise.all([
    ...[...MONSTER_DEFS, DOLL, PORTRAIT].map(async m => { monsterImages[m.id] = await Placeholder.find('monsters', m.id); }),
    ...CAMERAS.map(async c => { roomImages[c.id] = await Placeholder.find('rooms', c.id); }),
    Placeholder.find('rooms', 'room').then(url => { roomImages.shared = url; }),
    ...CAMERAS.flatMap(c => [1, 2, 3].map(async n => {
      const src = await Placeholder.find('rooms', `${c.id}_alt${n}`);
      if (src) photoAnomalies.push({ cam: c.id, kind: 'photo', src });
    })),
    Placeholder.find('rooms', 'office').then(url => {
      if (url) $('office-bg').style.backgroundImage = `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.45)), url("${url}")`;
    }),
  ]);
  for (const side of ['left', 'right', 'vent']) {
    const def = MONSTER_DEFS.find(m => m.entry === side);
    const url = monsterImages[def.id];
    if (url) ui.figures[side].style.backgroundImage = `url("${url}")`;
  }
  if (ui.camFeed) ui.camFeed.dataset.key = '';
}

function figureClass(id) {
  return `m-${id}` + (monsterImages[id] ? ' has-img' : '');
}

function enterFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
}

function startNight() {
  enterFullscreen();
  Sound.init();
  Sound.stopScare();
  state = {
    time: 0,
    hour: 0,
    power: 100,
    pan: 0.5,
    camCut: {},
    box: 100,
    windTick: 0,
    dollReleased: false,
    releaseAt: 0,
    boxTune: null,
    releaseTune: null,
    portrait: { cam: null, until: 0, stare: 0, nextCheck: PORTRAIT.checkEvery },
    anomalies: [],
    nextAnomaly: rand(20, 40),
    fakes: planFakes(),
    frozenUntil: 0,
    doors: { left: false, right: false },
    lights: { left: false, right: false, vent: false },
    monitorUp: false,
    cam: 'lobby',
    blackout: false,
    blackoutTimer: 0,
    blackoutStage: 0,
    stopMusic: null,
    running: true,
    nextEvent: rand(15, 30),
    staticUntil: 0,
  };
  monsters = createMonsters(night);

  document.body.classList.remove('low-power', 'shake', 'flicker', 'frozen');
  ui.fakeScare.classList.add('hidden');
  ui.officeDark.classList.add('hidden');
  ui.darkEyes.classList.add('hidden');
  ui.powerWarning.classList.add('hidden');
  ui.monitor.classList.add('hidden');
  ui.jumpscare.classList.remove('active');
  setControlsEnabled(true);

  ui.nightValue.textContent = night;
  show('game-screen');
  Sound.startAmbient();
  render();
  lastFrame = performance.now();
  requestAnimationFrame(loop);
}

/* ---------------- controls ---------------- */

function canSee(side) {
  if (side === 'left') return state.pan <= SIDE_VISIBLE;
  if (side === 'right') return state.pan >= 1 - SIDE_VISIBLE;
  return true;
}

function updatePan(dt) {
  if (state.monitorUp) return;
  let dir = panKey;
  if (!dir && mouseX !== null) {
    if (mouseX < PAN_EDGE) dir = -(0.35 + 0.65 * (PAN_EDGE - mouseX) / PAN_EDGE);
    else if (mouseX > 1 - PAN_EDGE) dir = 0.35 + 0.65 * (mouseX - (1 - PAN_EDGE)) / PAN_EDGE;
  }
  if (!dir) return;
  state.pan = Math.min(1, Math.max(0, state.pan + dir * PAN_SPEED * dt));
  for (const side of ['left', 'right']) {
    if (state.lights[side] && !canSee(side)) state.lights[side] = false;
  }
}

function toggleDoor(side) {
  if (!state || !state.running || state.blackout || state.monitorUp || !canSee(side)) return;
  state.doors[side] = !state.doors[side];
  Sound.doorSlam();
  render();
}

function toggleLight(side) {
  if (!state || !state.running || state.blackout || state.monitorUp || !canSee(side)) return;
  const on = !state.lights[side];
  state.lights = { left: false, right: false, vent: false };
  state.lights[side] = on;
  Sound.click();
  if (on && !monsterAt(side) && Math.random() < 0.04 + night * 0.01) fakeGlimpse(side);
  render();
}

function toggleMonitor() {
  if (!state || !state.running) return;
  if (state.blackout) { Sound.denied(); return; }
  state.monitorUp = !state.monitorUp;
  state.lights = { left: false, right: false, vent: false };
  if (state.monitorUp) {
    Sound.startCamStatic();
    Sound.staticBurst(0.2, 0.25);
  } else {
    Sound.stopCamStatic();
  }
  render();
}

function switchCam(id) {
  if (!state || !state.monitorUp || state.cam === id) return;
  state.cam = id;
  Sound.click();
  flashStatic(0.25);
  render();
}

function setControlsEnabled(on) {
  document.querySelectorAll('.door-btn, .light-btn, .vent-btn, #monitor-toggle-btn')
    .forEach(b => { b.disabled = !on; });
}

/* ---------------- monsters ---------------- */

function monsterAt(entry) {
  return monsters.find(m => m.entry === entry && m.atDoor);
}

function isBlocked(m) {
  if (m.entry === 'vent') return state.lights.vent;
  return state.doors[m.entry];
}

const PAN = { left: -0.9, right: 0.9, vent: 0 };

function moveMonster(m) {
  const watched = state.monitorUp && state.cam === m.path[m.pos];
  if (m.freezeWhenWatched && watched) return;
  if (Math.floor(Math.random() * 20) + 1 > m.level) return;

  const from = m.path[m.pos];
  m.pos++;
  const to = m.path[m.pos];
  m.camOffset = rand(-10, 10);
  m.camScale = rand(0.9, 1.25) + m.pos * 0.08;

  const cut = rand(2, 4);
  cutCam(from, cut);
  cutCam(to, cut);

  if (to === 'DOOR') {
    m.atDoor = true;
    m.doorTime = 0;
    m.blockTime = 0;
    m.attackAt = rand(...m.attackDelay) - (night - 1) * 0.25;
    if (m.entry !== 'vent' && state.doors[m.entry]) {
      Sound.knock(PAN[m.entry], 5, 0.9, 0.22);
    } else if (Math.random() < 0.4) {
      if (m.entry === 'vent') Sound.scrape(0);
      else if (m.id === 'whisper') Sound.whisper(PAN[m.entry]);
      else Sound.footsteps(PAN[m.entry], 4);
    }
  } else if (Math.random() < 0.15) {
    Sound.footsteps(PAN[m.entry] * 0.4, 2);
  }
}

function retreat(m) {
  m.atDoor = false;
  m.pos = Math.random() < 0.5 ? 0 : 1;
  m.moveTimer = m.moveEvery * 2;
  cutCam(m.path[m.pos], rand(1.5, 3));
}

// Slips in while the player is looking at the cameras and strikes when they look away.
function enterOffice(m) {
  m.atDoor = false;
  m.inside = true;
  m.insideTime = 0;
  m.loweredTime = 0;
  m.insideLimit = rand(8, 16);
}

function updateMonsters(dt) {
  for (const m of monsters) {
    if (m.level <= 0) continue;
    if (m.inside) {
      m.insideTime += dt;
      if (!state.monitorUp) m.loweredTime += dt;
      if (m.loweredTime > 0.2 || m.insideTime > m.insideLimit) {
        jumpscare(m.id, m.death);
        return;
      }
      continue;
    }
    if (m.atDoor) {
      m.doorTime += dt;
      if (isBlocked(m)) {
        m.blockTime += dt;
        if (m.blockTime >= m.blockToRetreat) retreat(m);
      } else if (m.doorTime >= m.attackAt) {
        if (state.monitorUp) {
          enterOffice(m);
        } else {
          jumpscare(m.id, m.death);
          return;
        }
      }
      continue;
    }
    m.moveTimer -= dt;
    if (m.moveTimer <= 0) {
      m.moveTimer = m.moveEvery;
      moveMonster(m);
    }
  }
}

function isCut(id) {
  return state.time < (state.camCut[id] || 0);
}

function stopDollTunes() {
  if (state.boxTune) { state.boxTune(); state.boxTune = null; }
  if (state.releaseTune) { state.releaseTune(); state.releaseTune = null; }
}

function updateDoll(dt) {
  if (state.dollReleased) {
    if (state.time >= state.releaseAt) jumpscare(DOLL.id, DOLL.death);
    return;
  }
  const onAttic = state.monitorUp && state.cam === DOLL.cam && !isCut(DOLL.cam);
  if (onAttic && windHeld) {
    state.box = Math.min(100, state.box + DOLL.windRate * dt);
    state.windTick -= dt;
    if (state.windTick <= 0) { state.windTick = 0.12; Sound.click(); }
  } else {
    state.box -= nightValue(DOLL.drain, night) * dt;
  }

  if (state.box <= 0) {
    state.box = 0;
    state.dollReleased = true;
    state.releaseAt = state.time + rand(...DOLL.releaseDelay);
    stopDollTunes();
    cutCam(DOLL.cam, 2);
    state.releaseTune = Sound.musicBox(1e9, { vol: 0.28, interval: 300, wobble: 0.14 });
    return;
  }

  if (onAttic && !state.boxTune) state.boxTune = Sound.musicBox(1e9, { vol: 0.07 });
  else if (!onAttic && state.boxTune) { state.boxTune(); state.boxTune = null; }
}

function updatePortrait(dt) {
  const p = state.portrait;
  if (p.cam) {
    const watching = state.monitorUp && state.cam === p.cam && !isCut(p.cam);
    if (watching) {
      p.stare += dt;
      const limit = nightValue(PORTRAIT.stareLimit, night);
      Sound.stare(Math.min(p.stare / limit, 1));
      if (p.stare >= limit) jumpscare(PORTRAIT.id, PORTRAIT.death);
    } else if (p.stare > 0 || state.time > p.until) {
      p.nextCheck = PORTRAIT.checkEvery * (p.stare > 0 ? 2 : 1);
      p.cam = null;
      p.stare = 0;
      Sound.stopStare();
    }
    return;
  }
  const chance = nightValue(PORTRAIT.chance, night);
  if (!chance) return;
  p.nextCheck -= dt;
  if (p.nextCheck > 0) return;
  p.nextCheck = PORTRAIT.checkEvery;
  if (Math.random() >= chance) return;
  // never on the camera being watched, so it's only ever discovered by switching to it
  const options = CAMERAS.filter(c => c.id !== DOLL.cam && !(state.monitorUp && c.id === state.cam));
  p.cam = options[Math.floor(Math.random() * options.length)].id;
  p.until = state.time + rand(...PORTRAIT.stay);
}

/* ---------------- power / time ---------------- */

function powerUsage() {
  let u = 1;
  if (state.doors.left) u++;
  if (state.doors.right) u++;
  if (state.lights.left || state.lights.right || state.lights.vent) u++;
  if (state.monitorUp) u++;
  return u;
}

function updatePower(dt) {
  if (state.blackout) return;
  state.power -= powerUsage() * dt * (1 / 9) * (1 + (night - 1) * 0.07);
  if (state.power <= 0) {
    state.power = 0;
    startBlackout();
  }
}

function startBlackout() {
  state.blackout = true;
  state.blackoutTimer = 0;
  state.blackoutStage = 0;
  state.doors = { left: false, right: false };
  state.lights = { left: false, right: false, vent: false };
  state.monitorUp = false;
  monsters.forEach(m => { m.level = 0; m.atDoor = false; m.inside = false; });
  stopDollTunes();
  state.portrait.cam = null;
  Sound.stopStare();
  setControlsEnabled(false);
  Sound.stopAmbient();
  Sound.stopTrack(1500);
  Sound.stopCamStatic();
  Sound.setHeartbeat(0);
  Sound.powerDown();
  ui.officeDark.classList.remove('hidden');
  ui.powerWarning.classList.remove('hidden');
  render();
}

function updateBlackout(dt) {
  state.blackoutTimer += dt;
  const t = state.blackoutTimer;
  if (state.blackoutStage === 0 && t > 4) {
    state.blackoutStage = 1;
    state.blackoutEnd = t + rand(10, 20);
    ui.darkEyes.classList.remove('hidden');
    ui.darkEyes.classList.add('flicker');
    state.stopMusic = Sound.musicBox(99999);
  } else if (state.blackoutStage === 1 && t > state.blackoutEnd) {
    state.blackoutStage = 2;
    state.blackoutEnd = t + rand(1.5, 3.5);
    if (state.stopMusic) state.stopMusic();
    ui.darkEyes.classList.add('hidden');
  } else if (state.blackoutStage === 2 && t > state.blackoutEnd) {
    jumpscare('entity', ENTITY_DEATH);
  }
}

function updateTime(dt) {
  state.time += dt;
  const hour = Math.floor(state.time / HOUR_SECONDS);
  if (hour !== state.hour) {
    state.hour = hour;
    if (hour >= 6) { nightComplete(); return; }
    if (hour === MUSIC_HOUR && !state.blackout) Sound.startTrack(MUSIC_SRC);
    if (hour === 2 || hour === 4) monsters.forEach(m => { if (m.level > 0) m.level++; });
  }
}

/* ---------------- ambience & random scares ---------------- */

// Atmosphere deliberately ignores monster positions so it can't be read as a warning.
function updateAmbience() {
  if (state.blackout) return;
  Sound.setTension(Math.min(state.time / (HOUR_SECONDS * 6), 1) * 0.7);
  document.body.classList.toggle('low-power', state.power < 20);
}

function fakeGlimpse(side) {
  const fig = ui.figures[side];
  const id = side === 'vent' ? 'crawler' : side === 'left' ? 'shadow' : 'whisper';
  setTimeout(() => {
    if (!state.running || !state.lights[side]) return;
    fig.className = `peek-figure show glimpse ${figureClass(id)}`;
    setTimeout(() => { if (state.running) render(); }, 70);
  }, rand(150, 600));
}

function randomEvent() {
  const roll = Math.random();
  const images = Object.values(scareImages);
  if (roll < 0.12) {
    Sound.setHeartbeat(rand(70, 110));
    setTimeout(() => { if (state.running && !state.blackout) Sound.setHeartbeat(0); }, rand(5000, 9000));
  } else if (roll < 0.2) {
    Sound.knock(rand(-1, 1));
  } else if (roll < 0.3) {
    cutCam(CAMERAS[Math.floor(Math.random() * CAMERAS.length)].id, rand(2, 4));
  } else if (state.monitorUp && roll < 0.5 && images.length) {
    const pick = images[Math.floor(Math.random() * images.length)];
    ui.hallucination.style.backgroundImage = `url("${pick}")`;
    ui.hallucination.classList.remove('hidden');
    Sound.staticBurst(0.15, 0.5);
    setTimeout(() => ui.hallucination.classList.add('hidden'), 90 + night * 15);
  } else if (roll < 0.55) {
    Sound.whisper(rand(-1, 1));
  } else if (roll < 0.75) {
    Sound.footsteps(rand(-1, 1), 2);
  } else if (roll < 0.9) {
    document.body.classList.add('flicker');
    setTimeout(() => document.body.classList.remove('flicker'), 250);
    setTimeout(() => document.body.classList.add('flicker'), 400);
    setTimeout(() => document.body.classList.remove('flicker'), 520);
  } else {
    Sound.breathing(rand(-0.3, 0.3));
  }
}

function cutCam(id, seconds) {
  if (!id || id === 'DOOR') return;
  state.camCut[id] = Math.max(state.camCut[id] || 0, state.time + seconds);
  if (state.monitorUp && state.cam === id) Sound.staticBurst(0.5, 0.4);
}

/* ---------------- anomalies ---------------- */

function watching(cam) {
  return state.monitorUp && state.cam === cam;
}

function anomalyPool() {
  return [...ANOMALIES.filter(a => a.kind === 'text' || roomImages[a.cam]), ...photoAnomalies];
}

function updateAnomalies(dt) {
  // an expired anomaly lingers while it's on screen, so it's gone the next time the camera is checked
  state.anomalies = state.anomalies.filter(a => state.time < a.until || watching(a.cam));
  state.nextAnomaly -= dt;
  if (state.nextAnomaly > 0) return;
  state.nextAnomaly = rand(30, 55) - night * 2;
  if (state.anomalies.length >= 2) return;
  const pool = anomalyPool().filter(a => !watching(a.cam) && !state.anomalies.some(b => b.cam === a.cam));
  if (!pool.length) return;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  state.anomalies.push({ ...pick, until: state.time + rand(20, 45) });
}

function anomalyHtml(a) {
  if (a.kind === 'eyes') {
    return `<i class="anom-eye" style="left:${a.x - a.gap / 2}%;top:${a.y}%"></i>` +
      `<i class="anom-eye" style="left:${a.x + a.gap / 2}%;top:${a.y}%"></i>`;
  }
  if (a.kind === 'figure') {
    return `<div class="anom-figure" style="left:${a.x}%;bottom:${a.bottom}%;height:${a.h}%;width:${a.h * 0.2}%"></div>`;
  }
  if (a.kind === 'text') {
    const tone = a.tone === 'pale' ? ' pale' : '';
    return `<div class="anom-text${tone}" style="left:${a.x}%;top:${a.y}%;--rot:${a.rot}deg">${a.text}</div>`;
  }
  if (a.kind === 'peek') return `<div class="anom-peek" style="left:${a.x}%;top:${a.y}%"></div>`;
  return '';
}

/* ---------------- fake-outs ---------------- */

// A few per night; rarer is scarier.
function planFakes() {
  const fakes = [{ type: 'silence', at: rand(80, 300) }];
  if (night >= 2) fakes.push({ type: 'fakescare', at: rand(120, 330) });
  if (night >= 3) fakes.push({ type: 'silence', at: rand(60, 330) });
  if (night >= 4 && Math.random() < 0.6) fakes.push({ type: 'rewind', at: rand(350, 356) });
  if (night >= 5) fakes.push({ type: 'freeze', at: rand(150, 280) });
  return fakes;
}

function showFakeScare() {
  const images = Object.values(scareImages);
  if (!images.length) return;
  ui.fakeScareImg.src = images[Math.floor(Math.random() * images.length)];
  ui.fakeScare.classList.remove('hidden');
  Sound.staticBurst(0.35, 1);
  setTimeout(() => ui.fakeScare.classList.add('hidden'), 260);
}

function runFake(type) {
  if (type === 'silence') {
    Sound.silence(3000);
    setTimeout(() => {
      if (!state.running || state.blackout) return;
      const r = Math.random();
      if (r < 0.4) Sound.knock(rand(-1, 1), 5, 0.9, 0.22);
      else if (r < 0.7) Sound.breathing(0);
    }, 3000);
  } else if (type === 'fakescare') {
    showFakeScare();
  } else if (type === 'rewind') {
    state.time = HOUR_SECONDS * 4 + rand(40, 55);
    state.hour = 4;
    Sound.staticBurst(0.6, 0.7);
    ui.timeDisplay.classList.remove('glitch');
    void ui.timeDisplay.offsetWidth;
    ui.timeDisplay.classList.add('glitch');
    document.body.classList.add('flicker');
    setTimeout(() => document.body.classList.remove('flicker'), 600);
  } else if (type === 'freeze') {
    const ms = 2600;
    state.frozenUntil = performance.now() + ms;
    document.body.classList.add('frozen');
    Sound.silence(ms);
    setTimeout(() => {
      document.body.classList.remove('frozen');
      if (state.running) showFakeScare();
    }, ms);
  }
}

function updateFakes() {
  for (const f of state.fakes) {
    if (f.done || state.time < f.at) continue;
    f.done = true;
    runFake(f.type);
  }
}

function flashStatic(seconds) {
  state.staticUntil = state.time + seconds;
  if (state.monitorUp) Sound.staticBurst(seconds * 0.6, 0.3);
}

/* ---------------- end states ---------------- */

async function jumpscare(who, message) {
  if (!state.running) return;
  state.running = false;
  if (state.stopMusic) state.stopMusic();
  stopDollTunes();
  Sound.stopAll();
  ui.monitor.classList.add('hidden');
  ui.jumpscareImg.src = scareImages[who] || await Placeholder.resolve(who);
  show('jumpscare-overlay');
  ui.jumpscare.classList.add('active');
  Sound.playScare(SCARE_SOUNDS, SCARE_SOUND_MAX_MS);
  setTimeout(() => {
    ui.jumpscare.classList.remove('active');
    $('gameover-text').textContent = `NIGHT ${night} · ${message}`;
    show('game-over-screen');
  }, 1900);
}

function nightComplete() {
  state.running = false;
  if (state.stopMusic) state.stopMusic();
  stopDollTunes();
  Sound.stopAll();
  Sound.chime();
  if (night >= LAST_NIGHT) {
    saveNight(1);
    setTimeout(() => show('win-screen'), 5500);
    show('night-complete-screen');
    $('night-complete-text').textContent = `NIGHT ${night} 생존.`;
    $('next-night-btn').classList.add('hidden');
    return;
  }
  $('next-night-btn').classList.remove('hidden');
  $('night-complete-text').textContent = `NIGHT ${night} 생존. 다음 밤은 더 길게 느껴질 것입니다.`;
  night++;
  saveNight(night);
  show('night-complete-screen');
}

/* ---------------- render ---------------- */

function formatHour(h) {
  return `${h === 0 ? 12 : h}:00 AM`;
}

function render() {
  if (!state) return;
  ui.powerValue.textContent = Math.ceil(state.power);
  ui.powerDisplay.classList.toggle('low', state.power < 20);
  ui.timeValue.textContent = formatHour(Math.min(state.hour, 5));
  ui.officePan.style.transform = `translateX(${-state.pan * 100 / 3}%)`;

  for (const side of ['left', 'right']) {
    ui.doors[side].classList.toggle('closed', state.doors[side]);
    ui.doorBtns[side].classList.toggle('active', state.doors[side]);
  }
  for (const side of ['left', 'right', 'vent']) {
    const lit = state.lights[side];
    ui.lightBtns[side].classList.toggle('active', lit);
    ui.windows[side].classList.toggle('lit', lit);
    const m = monsterAt(side);
    const fig = ui.figures[side];
    fig.className = 'peek-figure' + (lit && m ? ` show ${figureClass(m.id)}` : '');
  }

  ui.monitor.classList.toggle('hidden', !state.monitorUp);
  if (state.monitorUp) renderCamera();
}

function roomHtml(cam, photoOverride) {
  const own = photoOverride || roomImages[cam.id];
  const shared = !own && cam.crop && roomImages.shared;
  if (!own && !shared) return `<div class="room ${cam.cls}"></div>`;
  let style = `background-image:url('${own || shared}')`;
  if (own && cam.bright) style += `;filter:brightness(${cam.bright}) contrast(1.2) grayscale(.6) blur(.5px)`;
  if (shared) {
    style += `;background-size:${cam.crop.size};background-position:${cam.crop.pos}`;
    if (cam.crop.flip) style += ';transform:scaleX(-1)';
  }
  return `<div class="room room-photo${shared ? ' shared' : ''}" style="${style}"></div>`;
}

function dollHtml(awake) {
  const cls = awake ? ' awake' : '';
  if (monsterImages[DOLL.id]) {
    return `<img class="cam-monster-img${cls}" src="${monsterImages[DOLL.id]}" style="left:${DOLL.camX}%;height:34%">`;
  }
  return `<div class="cam-monster show m-doll${cls}" style="left:${DOLL.camX}%;bottom:14%;height:30%;width:9%"></div>`;
}

function stareHtml() {
  const src = monsterImages[PORTRAIT.id] || scareImages[PORTRAIT.id];
  return src ? `<img class="cam-stare" src="${src}">` : '';
}

function renderCamera() {
  const cam = CAMERAS.find(c => c.id === state.cam);
  ui.camLabel.textContent = cam.label;
  ui.camMap.querySelectorAll('.map-cam').forEach(b => b.classList.toggle('active', b.dataset.cam === cam.id));

  const here = monsters.filter(m => m.level > 0 && !m.atDoor && m.path[m.pos] === cam.id);
  const dollHere = cam.id === DOLL.cam && !state.dollReleased;
  const dollAwake = state.box < DOLL.lowAt;
  const staring = state.portrait.cam === cam.id;
  const anomalies = state.anomalies.filter(a => a.cam === cam.id);
  const photo = anomalies.find(a => a.kind === 'photo');
  const key = cam.id + '|' + here.map(m => `${m.id}${m.pos}`).join(',') +
    `|${dollHere ? 'D' + +dollAwake : ''}|${staring ? 'P' : ''}|${anomalies.map(a => a.kind + (a.src || a.x)).join(',')}`;
  if (ui.camFeed.dataset.key !== key) {
    ui.camFeed.dataset.key = key;
    ui.camFeed.innerHTML = roomHtml(cam, photo && photo.src) + anomalies.map(anomalyHtml).join('') +
      (dollHere ? dollHtml(dollAwake) : '') + (staring ? stareHtml() : '') + here.map(m => {
      if (monsterImages[m.id]) {
        const h = (m.id === 'crawler' ? 35 : 62) * m.camScale;
        return `<img class="cam-monster-img" src="${monsterImages[m.id]}" style="left:${m.camX + m.camOffset}%;height:${h}%">`;
      }
      const h = 55 * m.camScale;
      const w = m.id === 'crawler' ? 30 : 18 * m.camScale;
      const style = m.id === 'crawler'
        ? `left:${m.camX + m.camOffset}%;bottom:5%;height:25%;width:${w}%;clip-path:ellipse(50% 40% at 50% 60%)`
        : `left:${m.camX + m.camOffset}%;bottom:${8 - m.camScale * 3}%;height:${h}%;width:${w}%`;
      return `<div class="cam-monster show m-${m.id}" style="${style}"></div>`;
    }).join('');
  }

  ui.camNoSignal.classList.toggle('hidden', !isCut(cam.id));

  ui.windPanel.classList.toggle('hidden', !dollHere);
  if (dollHere) {
    ui.windFill.style.width = `${state.box}%`;
    ui.windFill.classList.toggle('low', dollAwake);
    ui.windBtn.classList.toggle('held', windHeld);
  }
  const atticBtn = ui.camMap.querySelector(`.map-cam[data-cam="${DOLL.cam}"]`);
  atticBtn.classList.toggle('warn', !state.dollReleased && dollAwake);

  const noisy = state.time < state.staticUntil;
  ui.camStatic.classList.toggle('burst', noisy);
  ui.camStatic.style.backgroundPosition = `${Math.random() * 200}px ${Math.random() * 200}px`;
}

/* ---------------- loop ---------------- */

function loop(now) {
  if (!state || !state.running) return;
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  if (now < state.frozenUntil) {
    requestAnimationFrame(loop);
    return;
  }

  updateTime(dt);
  if (!state.running) return;

  if (state.blackout) {
    updateBlackout(dt);
  } else {
    updatePan(dt);
    updatePower(dt);
    updateMonsters(dt);
    if (state.running) updateDoll(dt);
    if (state.running) updatePortrait(dt);
    if (state.running) updateAnomalies(dt);
    if (state.running) updateFakes();
    updateAmbience();
    state.nextEvent -= dt;
    if (state.nextEvent <= 0) {
      state.nextEvent = rand(15, 35) - night;
      randomEvent();
    }
  }
  if (!state.running) return;
  render();
  requestAnimationFrame(loop);
}

/* ---------------- wiring ---------------- */

$('start-btn').textContent = night > 1 ? `이어하기 (NIGHT ${night})` : '근무 시작 (NIGHT 1)';
$('start-btn').addEventListener('click', startNight);
$('next-night-btn').addEventListener('click', startNight);
$('retry-btn').addEventListener('click', startNight);
$('restart-btn').addEventListener('click', () => { night = 1; saveNight(1); startNight(); });

ui.doorBtns.left.addEventListener('click', () => toggleDoor('left'));
ui.doorBtns.right.addEventListener('click', () => toggleDoor('right'));
ui.lightBtns.left.addEventListener('click', () => toggleLight('left'));
ui.lightBtns.right.addEventListener('click', () => toggleLight('right'));
ui.lightBtns.vent.addEventListener('click', () => toggleLight('vent'));
$('monitor-toggle-btn').addEventListener('click', toggleMonitor);
$('monitor-close-btn').addEventListener('click', toggleMonitor);
ui.monitor.addEventListener('click', e => { if (e.target === ui.monitor) toggleMonitor(); });

document.addEventListener('keydown', e => {
  if (e.repeat || !state || !state.running || document.body.classList.contains('frozen')) return;
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 's') { e.preventDefault(); toggleMonitor(); }
  else if (k === 'a') toggleDoor('left');
  else if (k === 'd') toggleDoor('right');
  else if (k === 'q') toggleLight('left');
  else if (k === 'e') toggleLight('right');
  else if (k === 'f' || k === 'w') toggleLight('vent');
  else if (/^[0-9]$/.test(k) && CAMERAS[(+k + 9) % 10]) switchCam(CAMERAS[(+k + 9) % 10].id);
  else if (k === 'r') windHeld = true;
  else if (e.key === 'ArrowLeft') panKey = -1;
  else if (e.key === 'ArrowRight') panKey = 1;
});
document.addEventListener('keyup', e => {
  if ((e.key === 'ArrowLeft' && panKey < 0) || (e.key === 'ArrowRight' && panKey > 0)) panKey = 0;
  if (e.key.toLowerCase() === 'r') windHeld = false;
});
ui.windBtn.addEventListener('pointerdown', e => { e.preventDefault(); windHeld = true; });
ui.windBtn.addEventListener('pointerleave', () => { windHeld = false; });
document.addEventListener('pointerup', () => { windHeld = false; });
document.addEventListener('pointercancel', () => { windHeld = false; });
document.addEventListener('mousemove', e => { mouseX = e.clientX / window.innerWidth; });
document.documentElement.addEventListener('mouseleave', () => { mouseX = null; });

ui.jumpscareImg.addEventListener('load', () => {
  const img = ui.jumpscareImg;
  img.classList.toggle('portrait', img.naturalHeight > img.naturalWidth * 1.1);
});
ui.camStatic.style.backgroundImage = `url(${Placeholder.staticTexture()})`;
buildMap();
preloadScares();
Sound.preloadClips(SCARE_SOUNDS);
loadArt();
