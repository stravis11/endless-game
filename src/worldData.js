/* Tuning tables: biomes, creatures, surprises, ambience.
   Palettes are soft/desaturated on purpose — cozy, not saturated. */

export const SEED = 20260922;

export const WORLD = {
  chunkSize: 96,        // world units per chunk
  segs: 24,             // grid resolution per chunk
  viewRadius: 5,        // chunks kept loaded in each direction (11x11)
  waterLevel: 0.0,
};

export const BIOMES = {
  meadow: {
    label: 'Meadow', weight: 22, scale: 0.9, amp: 4.5, ridge: 0,
    top: [0x8fd18a, 0xa5dd90], low: [0x7cbf7f, 0x6fae77],
    props: [
      { kind: 'tree', density: 5.5 },
      { kind: 'flower', density: 14 },
      { kind: 'rock', density: 1.2 },
      { kind: 'grassTuft', density: 10 },
    ],
    ambient: ['butterflies', 'birds'],
  },
  birchGrove: {
    label: 'Birch Grove', weight: 14, scale: 1.0, amp: 5.5, ridge: 0,
    top: [0xa8e29a, 0xbde8a6], low: [0x8fc78f, 0x86bb88],
    props: [
      { kind: 'birch', density: 9 },
      { kind: 'flower', density: 9 },
      { kind: 'mushroom', density: 3 },
    ],
    ambient: ['fireflies', 'fallingLeaves'],
  },
  pineHighlands: {
    label: 'Pine Highlands', weight: 15, scale: 1.7, amp: 12, ridge: 0.45,
    top: [0x9ecf9b, 0xb2d8a4], low: [0x7dab84, 0x6f9c7c],
    props: [
      { kind: 'pine', density: 11 },
      { kind: 'rock', density: 3 },
      { kind: 'mushroom', density: 1.5 },
    ],
    ambient: ['windGusts', 'birds'],
  },
  lavenderFlats: {
    label: 'Lavender Flats', weight: 10, scale: 0.5, amp: 2.2, ridge: 0,
    top: [0xc8b4e0, 0xd6c6ea], low: [0xb7a3d4, 0xc4b2dd],
    props: [
      { kind: 'lavender', density: 22 },
      { kind: 'stoneRing', density: 0.4 },
      { kind: 'rock', density: 0.8 },
    ],
    ambient: ['butterflies', 'windGusts'],
  },
  sakuraHills: {
    label: 'Sakura Hills', weight: 9, scale: 1.2, amp: 8, ridge: 0.2,
    top: [0xefc4d8, 0xf6d2e2], low: [0xdfb0c9, 0xe8bdd2],
    props: [
      { kind: 'sakura', density: 7 },
      { kind: 'flower', density: 12 },
      { kind: 'lantern', density: 0.7 },
    ],
    ambient: ['fallingLeaves', 'fireflies'],
  },
  amberDesert: {
    label: 'Amber Dunes', weight: 9, scale: 1.1, amp: 6.5, ridge: 0.35,
    top: [0xe8c98f, 0xf0d69f], low: [0xd9b87e, 0xe3c489],
    props: [
      { kind: 'cactus', density: 2.2 },
      { kind: 'rock', density: 2.5 },
      { kind: 'bones', density: 0.25 },
    ],
    ambient: ['windGusts'],
  },
  frostVale: {
    label: 'Frost Vale', weight: 8, scale: 1.5, amp: 9, ridge: 0.3,
    top: [0xdfeef2, 0xecf6f9], low: [0xc9dfe7, 0xd9eaf0],
    props: [
      { kind: 'pine', density: 4 },
      { kind: 'iceShard', density: 2.5 },
      { kind: 'rock', density: 2 },
    ],
    ambient: ['aurora', 'snow'],
  },
  mossyFen: {
    label: 'Mossy Fen', weight: 8, scale: 0.7, amp: 2.8, ridge: 0,
    top: [0x86b58c, 0x97c397], low: [0x74a583, 0x86b58c],
    props: [
      { kind: 'willow', density: 3.5 },
      { kind: 'mushroom', density: 5 },
      { kind: 'reed', density: 12 },
      { kind: 'lantern', density: 0.5 },
    ],
    ambient: ['fireflies', 'rain'],
  },
  coralShore: {
    label: 'Coral Shore', weight: 7, scale: 0.6, amp: 3, ridge: 0,
    top: [0xf2d9b8, 0xf8e3c8], low: [0xe6c9a8, 0xefd4b5],
    props: [
      { kind: 'palm', density: 2.5 },
      { kind: 'shell', density: 6 },
      { kind: 'rock', density: 1.5 },
    ],
    ambient: ['birds', 'waves'],
  },
  starPlateau: {
    label: 'Star Plateau', weight: 4, scale: 1.3, amp: 14, ridge: 0.55,
    top: [0x9fb8d8, 0xb2c8e4], low: [0x8aa5c9, 0x9db5d4],
    props: [
      { kind: 'monolith', density: 0.8 },
      { kind: 'glowFlower', density: 4 },
      { kind: 'rock', density: 2.5 },
    ],
    ambient: ['aurora', 'shootingStars'],
  },
};

export const BIOME_KEYS = Object.keys(BIOMES);

/* Creatures: gentle, curious, never hostile. */
export const SPECIES = {
  puffhopper: { label: 'Puffhopper', color: 0xf2e8d5, color2: 0xd9c9a8, size: 0.5, speed: 2.2, kind: 'hopper', rarity: 1.0,
    lines: ['Boing! You smell like sunshine.', 'Hop hop! Did you see the sky today?', 'I know a shortcut to nowhere in particular.'] },
  mossTurtle: { label: 'Moss Turtle', color: 0x8fae7a, color2: 0x6f9460, size: 0.7, speed: 0.5, kind: 'walker', rarity: 0.7,
    lines: ['Slow down. The moss is lovely this time of year.', 'I have been walking to that rock for three weeks. Worth it.', 'Patience is just walking slowly with style.'] },
  skyWisp: { label: 'Sky Wisp', color: 0xbfe3f2, color2: 0x9fd0ec, size: 0.45, speed: 1.6, kind: 'floater', rarity: 0.6,
    lines: ['WoooOOOooo (that means hello).', 'I collect interesting clouds. Want to trade?', 'The wind told me a secret. It tickles.'] },
  trufflePig: { label: 'Truffle Pig', color: 0xd8a8a0, color2: 0xc08f88, size: 0.55, speed: 1.4, kind: 'sniffer', rarity: 0.8,
    lines: ['Sniff sniff... yes. Something wonderful is buried near here.', 'I rate this soil four snouts out of five.', 'A good truffle is like a good nap. You never forget it.'] },
  lanternFox: { label: 'Lantern Fox', color: 0xe8a86a, color2: 0xd08f50, size: 0.5, speed: 2.6, kind: 'trotter', rarity: 0.5,
    lines: ['My lantern lights the way to small wonders.', 'Foxes keep maps in their hearts, not their pockets.', 'Follow me? No? Next time, then.'] },
  glassHeron: { label: 'Glass Heron', color: 0xcfe8e0, color2: 0xa8d4c8, size: 0.8, speed: 1.0, kind: 'wader', rarity: 0.45,
    lines: ['Still waters reflect patient birds.', 'I am mostly here. Partly elsewhere.', 'One leg is for standing. The other is for elegance.'] },
  berrySprite: { label: 'Berry Sprite', color: 0xe88aa8, color2: 0xd06f90, size: 0.35, speed: 2.0, kind: 'flutter', rarity: 0.55,
    lines: ['Berry? Berry! Berry.', 'I planted that hillside. You are welcome.', 'Sweet things grow where laughter falls.'] },
  cloudSheep: { label: 'Cloud Sheep', color: 0xf5f0ea, color2: 0xe0d8ce, size: 0.75, speed: 0.8, kind: 'grazer', rarity: 0.65,
    lines: ['Baa. (Translation: enjoy the small things.)', 'I count shepherds to fall asleep.', 'My wool is 40% daydreams.'] },
};

export const SPECIES_KEYS = Object.keys(SPECIES);

/* Surprises: three tiers of rarity. Weight = relative spawn chance within tier. */
export const SURPRISES = {
  common: [
    { id: 'flowerRing', label: 'a perfect ring of wildflowers', weight: 10, build: 'flowerRing' },
    { id: 'boulderFace', label: 'a boulder that looks like a sleeping face', weight: 8, build: 'boulderFace' },
    { id: 'tinyBridge', label: 'a tiny wooden bridge over nothing', weight: 7, build: 'tinyBridge' },
    { id: 'picnic', label: 'an abandoned picnic, plates still warm', weight: 6, build: 'picnic' },
    { id: 'stoneStack', label: 'a stack of balanced pebbles', weight: 9, build: 'stoneStack' },
    { id: 'swing', label: 'a rope swing from a lone tree', weight: 6, build: 'swing' },
  ],
  uncommon: [
    { id: 'hotSpring', label: 'a steaming hot spring ringed with stones', weight: 6, build: 'hotSpring' },
    { id: 'giantMushroom', label: 'a mushroom the size of a cottage', weight: 5, build: 'giantMushroom' },
    { id: 'wishTree', label: 'a tree hung with tiny ribbons and notes', weight: 5, build: 'wishTree' },
    { id: 'obelisk', label: 'a humming obelisk covered in soft glyphs', weight: 4, build: 'obelisk' },
    { id: 'sundial', label: 'an ancient sundial that runs a little fast', weight: 4, build: 'sundial' },
    { id: 'beacon', label: 'a lighthouse with no sea in sight', weight: 3, build: 'beacon' },
  ],
  rare: [
    { id: 'floatingIsle', label: 'a floating island drifting quietly overhead', weight: 3, build: 'floatingIsle' },
    { id: 'whaleSkeleton', label: 'the gentle skeleton of an enormous sky-whale', weight: 2, build: 'whaleSkeleton' },
    { id: 'doorway', label: 'a free-standing doorway, ajar, glowing faintly', weight: 2, build: 'doorway' },
    { id: 'giantSnail', label: 'a cottage-sized snail wearing a garden', weight: 2, build: 'giantSnail' },
    { id: 'meteorGarden', label: 'a fallen star, sprouting glowing flowers', weight: 2, build: 'meteorGarden' },
    { id: 'carousel', label: 'an old carousel, turning with no music', weight: 1, build: 'carousel' },
  ],
};

export const AMBIENT_EVENTS = [
  { id: 'fireflies', label: 'Fireflies', meanGap: 90, dur: 50 },
  { id: 'butterflies', label: 'Butterflies', meanGap: 80, dur: 40 },
  { id: 'rain', label: 'Soft rain', meanGap: 160, dur: 70 },
  { id: 'fallingLeaves', label: 'Falling leaves', meanGap: 70, dur: 45 },
  { id: 'birds', label: 'Passing birds', meanGap: 60, dur: 30 },
  { id: 'aurora', label: 'Aurora', meanGap: 200, dur: 90 },
  { id: 'snow', label: 'Snow flurries', meanGap: 150, dur: 60 },
  { id: 'windGusts', label: 'Wind gusts', meanGap: 50, dur: 25 },
  { id: 'shootingStars', label: 'Shooting stars', meanGap: 120, dur: 40 },
  { id: 'waves', label: 'Distant waves', meanGap: 100, dur: 45 },
];

/* Gifts entities may give when befriended. */
export const GIFTS = [
  'a smooth blue pebble',
  'a pressed flower',
  'a perfectly round berry',
  'a tiny brass key (nothing nearby is locked)',
  'a folded paper crane',
  'a jar of firefly light',
  'a speckled feather',
  'a piece of amber with a leaf inside',
  'a map to somewhere pleasant',
  'a shiny bottle cap',
];
