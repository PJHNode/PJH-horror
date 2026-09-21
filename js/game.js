const HOUR_SECONDS = 60;
const LAST_NIGHT = 5;
const SAVE_KEY = 'pjh-horror-night';

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
  camTabs: $('camera-tabs'),
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

function buildCameraTabs() {
  ui.camTabs.innerHTML = '';
  CAMERAS.forEach((cam, i) => {
    const b = document.createElement('button');
    b.className = 'cam-tab';
    b.dataset.cam = cam.id;
    b.textContent = `${i + 1}. ${cam.label.split('· ')[1]}`;
    b.addEventListener('click', () => switchCam(cam.id));
    ui.camTabs.appendChild(b);
  });
}

async function preloadScares() {
  const names = [...MONSTER_DEFS.map(m => m.id), 'entity'];
  const urls = await Promise.all(names.map(n => Placeholder.resolve(n)));
  names.forEach((n, i) => { scareImages[n] = urls[i]; });
  Object.values(scareImages).forEach(src => { new Image().src = src; });
}

const monsterImages = {};
const roomImages = {};

async function loadArt() {
  await Promise.all([
    ...MONSTER_DEFS.map(async m => { monsterImages[m.id] = await Placeholder.find('monsters', m.id); }),
    ...CAMERAS.map(async c => { roomImages[c.id] = await Placeholder.find('rooms', c.id); }),
    Placeholder.find('rooms', 'room').then(url => { roomImages.shared = url; }),
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

function startNight() {
  Sound.init();
  state = {
    time: 0,
    hour: 0,
    power: 100,
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

  document.body.classList.remove('low-power', 'shake', 'flicker');
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

function toggleDoor(side) {
  if (!state || !state.running || state.blackout || state.monitorUp) return;
  state.doors[side] = !state.doors[side];
  Sound.doorSlam();
  render();
}

function toggleLight(side) {
  if (!state || !state.running || state.blackout || state.monitorUp) return;
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

  if (state.monitorUp && (state.cam === from || state.cam === to)) flashStatic(0.6);

  if (to === 'DOOR') {
    m.atDoor = true;
    m.doorTime = 0;
    m.blockTime = 0;
    m.attackAt = rand(...m.attackDelay) - (night - 1) * 0.4;
    if (Math.random() < 0.4) {
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
}

function updateMonsters(dt) {
  for (const m of monsters) {
    if (m.level <= 0) continue;
    if (m.atDoor) {
      m.doorTime += dt;
      if (isBlocked(m)) {
        m.blockTime += dt;
        if (m.blockTime >= m.blockToRetreat) retreat(m);
      } else if (m.doorTime >= m.attackAt) {
        jumpscare(m.id, m.death);
        return;
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
  state.power -= powerUsage() * dt * (1 / 9) * (1 + (night - 1) * 0.12);
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
  monsters.forEach(m => { m.level = 0; m.atDoor = false; });
  setControlsEnabled(false);
  Sound.stopAmbient();
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
    if (hour >= 2 && hour <= 4) monsters.forEach(m => { if (m.level > 0) m.level++; });
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
  } else if (state.monitorUp && roll < 0.45 && images.length) {
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

function flashStatic(seconds) {
  state.staticUntil = state.time + seconds;
  if (state.monitorUp) Sound.staticBurst(seconds * 0.6, 0.3);
}

/* ---------------- end states ---------------- */

async function jumpscare(who, message) {
  if (!state.running) return;
  state.running = false;
  if (state.stopMusic) state.stopMusic();
  Sound.stopAll();
  ui.monitor.classList.add('hidden');
  ui.jumpscareImg.src = scareImages[who] || await Placeholder.resolve(who);
  show('jumpscare-overlay');
  ui.jumpscare.classList.add('active');
  Sound.scream();
  setTimeout(() => {
    ui.jumpscare.classList.remove('active');
    $('gameover-text').textContent = `NIGHT ${night} · ${message}`;
    show('game-over-screen');
  }, 1900);
}

function nightComplete() {
  state.running = false;
  if (state.stopMusic) state.stopMusic();
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

function roomHtml(cam) {
  const own = roomImages[cam.id];
  const shared = !own && cam.crop && roomImages.shared;
  if (!own && !shared) return `<div class="room ${cam.cls}"></div>`;
  let style = `background-image:url('${own || shared}')`;
  if (shared) {
    style += `;background-size:${cam.crop.size};background-position:${cam.crop.pos}`;
    if (cam.crop.flip) style += ';transform:scaleX(-1)';
  }
  return `<div class="room room-photo" style="${style}"></div>`;
}

function renderCamera() {
  const cam = CAMERAS.find(c => c.id === state.cam);
  ui.camLabel.textContent = cam.label;
  ui.camTabs.querySelectorAll('.cam-tab').forEach(b => b.classList.toggle('active', b.dataset.cam === cam.id));

  const here = monsters.filter(m => m.level > 0 && !m.atDoor && m.path[m.pos] === cam.id);
  const key = cam.id + '|' + here.map(m => `${m.id}${m.pos}`).join(',');
  if (ui.camFeed.dataset.key !== key) {
    ui.camFeed.dataset.key = key;
    ui.camFeed.innerHTML = roomHtml(cam) + here.map(m => {
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

  const noisy = state.time < state.staticUntil;
  ui.camStatic.classList.toggle('burst', noisy);
  ui.camStatic.style.backgroundPosition = `${Math.random() * 200}px ${Math.random() * 200}px`;
}

/* ---------------- loop ---------------- */

function loop(now) {
  if (!state || !state.running) return;
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;

  updateTime(dt);
  if (!state.running) return;

  if (state.blackout) {
    updateBlackout(dt);
  } else {
    updatePower(dt);
    updateMonsters(dt);
    updateAmbience();
    state.nextEvent -= dt;
    if (state.nextEvent <= 0) {
      state.nextEvent = rand(15, 35) - night * 2;
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
  if (e.repeat || !state || !state.running) return;
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 's') { e.preventDefault(); toggleMonitor(); }
  else if (k === 'a') toggleDoor('left');
  else if (k === 'd') toggleDoor('right');
  else if (k === 'q') toggleLight('left');
  else if (k === 'e') toggleLight('right');
  else if (k === 'f' || k === 'w') toggleLight('vent');
  else if (/^[1-7]$/.test(k)) switchCam(CAMERAS[+k - 1].id);
});

ui.jumpscareImg.addEventListener('load', () => {
  const img = ui.jumpscareImg;
  img.classList.toggle('portrait', img.naturalHeight > img.naturalWidth * 1.1);
});
ui.camStatic.style.backgroundImage = `url(${Placeholder.staticTexture()})`;
buildCameraTabs();
preloadScares();
loadArt();
