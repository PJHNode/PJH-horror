// Setting: the old Baekun family mansion, now a closed memorial museum. The guard's office sits at the back.
// crop: how the shared assets/rooms/room.* photo is framed when a camera has no photo of its own.
// bright: brightness for this camera's own photo (dark photos need more so black silhouettes stay visible).
// btn: position of the camera button on the map (SVG viewBox MAP_VIEWBOX).
// Camera order = number keys 1-9, 0.
const CAMERAS = [
  { id: 'lobby',   short: '1',  label: 'CAM 1 · 현관 홀',       cls: 'room-lobby',   btn: [168, 81],  crop: { size: 'cover', pos: '50% 50%' } },
  { id: 'study',   short: '2',  label: 'CAM 2 · 서재',          cls: 'room-storage', btn: [15, 24],   bright: 1.5, crop: { size: '210%', pos: '55% 35%' } },
  { id: 'nursery', short: '3',  label: 'CAM 3 · 아이 방',       cls: 'room-east',    btn: [254, 24],  bright: 1.3, crop: { size: '220%', pos: '95% 95%', flip: true } },
  { id: 'attic',   short: '4',  label: 'CAM 4 · 다락방',        cls: 'room-vent',    btn: [134, 12],  bright: 1.5, crop: { size: '260%', pos: '50% 0%', flip: true } },
  { id: 'corrA',   short: '5',  label: 'CAM 5 · 초상화 복도',   cls: 'room-corrA',   btn: [42, 137],  bright: 2, crop: { size: '260%', pos: '12% 45%' } },
  { id: 'corrB',   short: '6',  label: 'CAM 6 · 하얀 복도',   cls: 'room-corrB',   btn: [227, 137], crop: { size: '260%', pos: '90% 45%' } },
  { id: 'west',    short: '7',  label: 'CAM 7 · 응접실',        cls: 'room-west',    btn: [14, 221],  crop: { size: '170%', pos: '20% 80%', flip: true } },
  { id: 'east',    short: '8',  label: 'CAM 8 · 식당',          cls: 'room-east',    btn: [255, 221], crop: { size: '170%', pos: '85% 85%' } },
  { id: 'storage', short: '9',  label: 'CAM 9 · 보일러실',      cls: 'room-storage', btn: [124, 130], crop: { size: '230%', pos: '58% 40%', flip: true } },
  { id: 'ventcam', short: '10', label: 'CAM 10 · 난방 덕트',    cls: 'room-vent',    btn: [160, 169] },
];

const MAP_VIEWBOX = '0 0 300 260';
const MAP_ROOMS = [
  [125, 5, 50, 30],    // attic
  [143, 35, 14, 15],   // attic stairs
  [10, 5, 75, 40],     // study
  [85, 18, 30, 14],    // study -> hall
  [101, 32, 14, 18],
  [215, 5, 75, 40],    // nursery
  [185, 18, 30, 14],   // nursery -> hall
  [185, 32, 14, 18],
  [95, 50, 110, 50],   // entrance hall
  [40, 80, 35, 110],   // portrait corridor
  [225, 80, 35, 110],  // servants' corridor
  [75, 80, 20, 18],    // hall -> portrait corridor
  [205, 80, 20, 18],   // hall -> servants' corridor
  [10, 190, 75, 50],   // parlour
  [215, 190, 75, 50],  // dining room
  [120, 115, 60, 35],  // boiler room
  [141, 100, 18, 15],  // hall -> boiler room
  [85, 213, 25, 18],   // left door
  [190, 213, 25, 18],  // right door
];
const MAP_OFFICE = [110, 200, 80, 55];
const MAP_DUCT = 'M150 150 L150 163 L140 177 L150 200';

// ai: difficulty per night (index 0 = night 1). Each move tick the monster advances if rand(1..20) <= ai.
// entry: where it attacks from. freezeWhenWatched: can't move while its camera is on screen.
const MONSTER_DEFS = [
  {
    id: 'shadow',
    name: '그림자',
    path: ['study', 'lobby', 'corrA', 'west', 'DOOR'],
    entry: 'left',
    ai: [3, 4, 6, 8, 11],
    moveEvery: 4,
    attackDelay: [7, 9],
    blockToRetreat: 4,
    freezeWhenWatched: true,
    camX: 28,
    death: '그림자는 왼쪽 문으로 조용히 들어왔다.',
  },
  {
    id: 'whisper',
    name: '속삭이는 여자',
    path: ['nursery', 'lobby', 'corrB', 'east', 'DOOR'],
    entry: 'right',
    ai: [2, 4, 5, 7, 10],
    moveEvery: 3.6,
    attackDelay: [5, 7],
    blockToRetreat: 5,
    freezeWhenWatched: false,
    camX: 58,
    death: '속삭임이 귓가에 닿았을 땐, 이미 늦었다.',
  },
  {
    id: 'crawler',
    name: '기어오는 것',
    path: ['storage', 'ventcam', 'DOOR'],
    entry: 'vent',
    ai: [0, 2, 4, 6, 9],
    moveEvery: 6,
    attackDelay: [6, 8],
    blockToRetreat: 2.5,
    freezeWhenWatched: true,
    camX: 42,
    death: '환기구 안에서 무언가가 기어 나왔다.',
  },
];

// Lives in the attic. A music box keeps it asleep; wind it from CAM 4. If it runs out the doll
// is released and nothing can stop it. Per-night arrays are indexed by night - 1.
const DOLL = {
  id: 'doll',
  name: '다락방 인형',
  cam: 'attic',
  drain: [0.6, 0.7, 0.85, 1.05, 1.3],  // % per second
  windRate: 28,                        // % per second while winding
  lowAt: 25,                           // below this it stirs and the map warns
  releaseDelay: [10, 16],
  camX: 58,
  death: '오르골 소리가 멈췄다. 다락방에는 아무것도 없었다.',
};

// Shows up on a random camera staring into the lens. Looking at it too long is fatal.
const PORTRAIT = {
  id: 'portrait',
  name: '초상화 속 얼굴',
  chance: [0, 0.12, 0.22, 0.35, 0.5],  // per check
  checkEvery: 9,
  stay: [10, 16],
  stareLimit: [0, 2.6, 2.2, 1.8, 1.4],
  death: '그 얼굴과 눈을 너무 오래 마주쳤다.',
};

const ENTITY_DEATH = '전기가 나간 어둠 속에서, 그것은 줄곧 기다리고 있었다.';

function nightValue(arr, night) {
  return arr[Math.min(night, arr.length) - 1];
}

function createMonsters(night) {
  return MONSTER_DEFS.map(def => ({
    ...def,
    level: nightValue(def.ai, night),
    pos: 0,
    moveTimer: Math.random() * def.moveEvery,
    atDoor: false,
    inside: false,
    doorTime: 0,
    blockTime: 0,
    attackAt: 0,
    camOffset: 0,
    camScale: 1,
  }));
}
