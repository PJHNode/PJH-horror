const CAMERAS = [
  { id: 'lobby',   label: 'CAM 1 · 로비',        cls: 'room-lobby' },
  { id: 'corrA',   label: 'CAM 2A · 서쪽 복도',  cls: 'room-corrA' },
  { id: 'corrB',   label: 'CAM 2B · 동쪽 복도',  cls: 'room-corrB' },
  { id: 'west',    label: 'CAM 3 · 서쪽 대기실', cls: 'room-west' },
  { id: 'east',    label: 'CAM 4 · 동쪽 대기실', cls: 'room-east' },
  { id: 'storage', label: 'CAM 5 · 창고',        cls: 'room-storage' },
  { id: 'ventcam', label: 'CAM 6 · 환기 덕트',   cls: 'room-vent' },
];

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
    doorTime: 0,
    blockTime: 0,
    attackAt: 0,
    revealed: false,
    camOffset: 0,
    camScale: 1,
  }));
}
