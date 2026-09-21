// crop: how the shared assets/rooms/room.* photo is framed when a camera has no photo of its own.
// btn: position of the camera button on the map (SVG viewBox 300x215).
const CAMERAS = [
  { id: 'lobby',   short: '1',  label: 'CAM 1 · 로비',        cls: 'room-lobby',   btn: [168, 36],  crop: { size: 'cover', pos: '50% 50%' } },
  { id: 'corrA',   short: '2A', label: 'CAM 2A · 서쪽 복도',  cls: 'room-corrA',   btn: [42, 92],   crop: { size: '260%', pos: '12% 45%' } },
  { id: 'corrB',   short: '2B', label: 'CAM 2B · 동쪽 복도',  cls: 'room-corrB',   btn: [227, 92],  crop: { size: '260%', pos: '90% 45%' } },
  { id: 'west',    short: '3',  label: 'CAM 3 · 서쪽 대기실', cls: 'room-west',    btn: [14, 176],  crop: { size: '170%', pos: '20% 80%', flip: true } },
  { id: 'east',    short: '4',  label: 'CAM 4 · 동쪽 대기실', cls: 'room-east',    btn: [255, 176], crop: { size: '170%', pos: '85% 85%' } },
  { id: 'storage', short: '5',  label: 'CAM 5 · 창고',        cls: 'room-storage', btn: [148, 86],  crop: { size: '230%', pos: '58% 40%', flip: true } },
  { id: 'ventcam', short: '6',  label: 'CAM 6 · 환기 덕트',   cls: 'room-vent',    btn: [160, 124] },
];

const MAP_ROOMS = [
  [95, 5, 110, 50],    // lobby
  [40, 35, 35, 110],   // west corridor
  [225, 35, 35, 110],  // east corridor
  [75, 35, 20, 18],    // lobby -> west corridor
  [205, 35, 20, 18],   // lobby -> east corridor
  [10, 145, 75, 50],   // west waiting room
  [215, 145, 75, 50],  // east waiting room
  [120, 70, 60, 35],   // storage
  [141, 55, 18, 15],   // lobby -> storage
  [85, 168, 25, 18],   // left door
  [190, 168, 25, 18],  // right door
];
const MAP_OFFICE = [110, 155, 80, 55];
const MAP_DUCT = 'M150 105 L150 118 L140 132 L150 155';

// ai: difficulty per night (index 0 = night 1). Each move tick the monster advances if rand(1..20) <= ai.
// entry: where it attacks from. freezeWhenWatched: can't move while its camera is on screen.
const MONSTER_DEFS = [
  {
    id: 'shadow',
    name: '그림자',
    path: ['lobby', 'corrA', 'west', 'DOOR'],
    entry: 'left',
    ai: [3, 6, 9, 12, 15],
    moveEvery: 5,
    attackDelay: [7, 9],
    blockToRetreat: 4,
    freezeWhenWatched: true,
    camX: 28,
    death: '그림자는 왼쪽 문으로 조용히 들어왔다.',
  },
  {
    id: 'whisper',
    name: '속삭이는 여자',
    path: ['lobby', 'corrB', 'east', 'DOOR'],
    entry: 'right',
    ai: [2, 5, 8, 11, 14],
    moveEvery: 4.5,
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
    ai: [0, 4, 7, 10, 14],
    moveEvery: 6,
    attackDelay: [6, 8],
    blockToRetreat: 2.5,
    freezeWhenWatched: true,
    camX: 42,
    death: '환기구 안에서 무언가가 기어 나왔다.',
  },
];

const ENTITY_DEATH = '전기가 나간 어둠 속에서, 그것은 줄곧 기다리고 있었다.';

function createMonsters(night) {
  return MONSTER_DEFS.map(def => ({
    ...def,
    level: def.ai[Math.min(night, def.ai.length) - 1],
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
