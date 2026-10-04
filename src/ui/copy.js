// Every word on the page. The stops follow the walk in journey.js; each has its room name as it would be written
// on a plan, the reading, an English name, the hour's name, and two lines: one in English, one in Japanese.
export const TITLE = {
  jp: '移ろい',
  kana: 'うつろい',
  en: 'Utsuroi',
  sub: 'A house in Kyoto, from first light to last',
  subJa: '京の家、夜明けから夜まで',
  gloss: 'utsuroi — the passing of things; the way a colour, a season or a light changes while you watch it.',
};

export const COPY = [
  { id: 'gate', jp: '門', kana: 'もん', en: 'The gate', time: 'Before dawn',
    body: 'Lanterns still lit, the garden held in mist. Nothing has begun yet.',
    ja: '灯りはまだ消えず、庭は霧の中。まだ何も始まっていない。' },
  { id: 'roji', jp: '露地', kana: 'ろじ', en: 'The dewy path', time: 'Sunrise',
    body: 'Stones set into moss, spaced so the foot slows and the eye looks down. You arrive by walking slowly.',
    ja: '苔に据えた飛石。足が緩み、目が下を向くように置かれている。' },
  { id: 'genkan', jp: '玄関', kana: 'げんかん', en: 'Genkan', time: 'Early morning',
    body: 'Earth floor, cedar step. Shoes stay here; the house begins one step up.',
    ja: '土間と杉の式台。履物はここに置き、家は一段上から始まる。' },
  { id: 'irigawa', jp: '入側', kana: 'いりがわ', en: 'Irigawa', time: 'Morning',
    body: 'A corridor of glass and paper between the rooms and the garden, where the low sun comes in sideways.',
    ja: '座敷と庭のあいだの縁。低い陽が、硝子と障子越しに横から差し込む。' },
  { id: 'zashiki', jp: '座敷', kana: 'ざしき', en: 'Zashiki', time: 'Morning',
    body: 'Ten mats and an alcove. Sit down, and the garden becomes the scroll on the wall.',
    ja: '十畳と床の間。座れば、庭が掛軸になる。' },
  { id: 'tea', jp: '茶室', kana: 'ちゃしつ', en: 'The tea room', time: 'Late morning',
    body: 'Four and a half mats under a ceiling kept low on purpose. The iron kettle hums; tea people call it wind in the pines.',
    ja: '四畳半、わざと低い天井。鉄瓶の湯が鳴る。茶人はそれを松風と呼ぶ。' },
  { id: 'bridge', jp: '渡廊下', kana: 'わたりろうか', en: 'The bridge', time: 'Noon',
    body: 'A roofed walk over the stream. At noon the koi rise where the light is brightest.',
    ja: '流れをまたぐ屋根付きの廊下。正午、鯉は光のいちばん強いところへ上がってくる。' },
  { id: 'hearth', jp: '囲炉裏', kana: 'いろり', en: 'The hearth', time: 'Afternoon',
    body: 'Charcoal banked in ash, a kettle on a hook from the smoke-black beam. A fire like this is kept, not lit.',
    ja: '灰に埋けた炭、煤けた梁から下がる自在鉤。この火は熾すものではなく、守るもの。' },
  { id: 'engawa', jp: '縁側', kana: 'えんがわ', en: 'Engawa', time: 'Late afternoon',
    body: 'Inside and outside share one floor. With the sun behind them, the maples glow.',
    ja: '内と外がひとつの床を分け合う。西日を背に、楓が透ける。' },
  { id: 'kare', jp: '枯山水', kana: 'かれさんすい', en: 'The dry garden', time: 'Low sun',
    body: 'Raked every morning. In this light every ridge of gravel throws its own shadow.',
    ja: '毎朝引き直す砂紋。この光では、ひと筋ごとに影が立つ。' },
  { id: 'bedroom', jp: '寝室', kana: 'しんしつ', en: 'Bedroom', time: 'Sunset',
    body: 'The paper turns amber, then the lamps take over. An indigo quilt, nothing more.',
    ja: '障子が琥珀色に染まり、やがて行灯に灯が移る。藍の布団、それだけ。' },
  { id: 'bath', jp: '湯殿', kana: 'ゆどの', en: 'The bath', time: 'Dusk',
    body: 'Hinoki brimming, the east side open to bamboo. The water darkens the wood where it spills.',
    ja: '檜の湯船に湯が満ち、東は竹林へ開く。溢れた湯が木の色を深める。' },
  { id: 'night', jp: '夜', kana: 'よる', en: 'Night', time: 'Night',
    body: 'The house becomes a lantern. The pond holds a second one.',
    ja: '家がひとつの灯籠になる。池にもうひとつ。' },
  { id: 'above', jp: '間取り', kana: 'まどり', en: 'The plan', time: 'From above',
    body: 'Four wings, one garden, one walk. Choose a room to go back to it.',
    ja: '四つの棟、ひとつの庭、ひとつの道のり。部屋を選べば、そこへ戻る。' },
];

export const SEASONS = [
  { jp: '春', en: 'Spring', note: 'Cherry in flower, maples in new leaf' },
  { jp: '夏', en: 'Summer', note: 'Deep green, fireflies over the stream at night' },
  { jp: '秋', en: 'Autumn', note: 'Momiji at their reddest' },
  { jp: '冬', en: 'Winter', note: 'Snow on the roofs and the lanterns' },
];

// the places on the plan you can return to from above, and the stop each one leads to
export const PLACES = [
  { jp: '門', en: 'Gate', x: -21.5, z: 17.0, stop: 0 },
  { jp: '露地', en: 'Roji', x: -20.6, z: 8.6, stop: 1 },
  { jp: '玄関', en: 'Genkan', x: -21.4, z: 0.4, stop: 2 },
  { jp: '座敷', en: 'Zashiki', x: -13.2, z: -1.4, stop: 4 },
  { jp: '茶室', en: 'Tea room', x: -5.9, z: -0.9, stop: 5 },
  { jp: '渡廊下', en: 'Bridge', x: -2.7, z: 1.1, stop: 6 },
  { jp: '囲炉裏', en: 'Hearth', x: 2.3, z: -1.8, stop: 7 },
  { jp: '縁側', en: 'Engawa', x: 7.4, z: 1.0, stop: 8 },
  { jp: '枯山水', en: 'Dry garden', x: 14.8, z: 4.0, stop: 9 },
  { jp: '寝室', en: 'Bedroom', x: 10.5, z: -4.6, stop: 10 },
  { jp: '湯殿', en: 'Bath', x: 15.0, z: -5.0, stop: 11 },
  { jp: '池', en: 'Pond', x: -1.5, z: 7.8, stop: 12 },
];

// whose work the garden is built from, as their licences ask: grouped as the colophon sets them
const SF = 'https://sketchfab.com/3d-models/';
const BY = ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'];
const NCSA = ['CC BY-NC-SA 4.0', 'https://creativecommons.org/licenses/by-nc-sa/4.0/'];
const STD = ['Sketchfab Standard', 'https://sketchfab.com/licenses'];
const CC0 = ['CC0', 'https://creativecommons.org/publicdomain/zero/1.0/'];
export const REPO = 'https://github.com/billpwchan/utsuroi';
export const COLOPHON = {
  en: 'The garden is made of other people’s work: stones, trees and things scanned where they stand, wood modelled branch by branch, surfaces photographed. Each is used under its licence, with thanks.',
  ja: 'この庭は、ほかの人々の仕事でできている。石も木も道具も、その場で測られ、写されたもの。感謝を込めて。',
};
export const CREDITS = [
  { group: 'Trees', jp: '木', items: [
    { jp: '枝垂桜', use: 'The weeping cherry', work: 'Cherry tree', by: 'matousekfoto', lic: BY, url: SF + 'cherry-tree-232e1f60165342afb09a40230f7a469d' },
    { jp: '桜', use: 'The cherries', work: 'Japanese Cherry tree', by: 'Nice2meetU2', lic: BY, url: SF + 'japanese-cherry-tree-ca5a9449555e490cbe726671ed8f95a4' },
    { jp: '紅葉', use: 'The maples', work: 'Tree – Japanese Maple', by: 'CHEI – UC San Diego', lic: BY, url: SF + 'tree-japanese-maple-89cc344581d94991abce6f9fa0af8be3' },
    { jp: '紅葉', use: 'The maples', work: 'Japanese Maple', by: 'stickbone', lic: BY, url: SF + 'japanese-maple-d7ad35d2630f40638e93f43dbd5fd28e' },
    { jp: '刈込', use: 'The clipped shrubs', work: 'Hedge 01', by: 'Publicdomaintextures', lic: BY, url: SF + 'hedge-01-a4eff014b1a84d478d7297acf4eb6160' },
    { jp: '黒松', use: 'The black pines', work: 'Japanese Black Pine', by: 'matt z chan', lic: BY, url: SF + 'japanese-black-pine-f0cb4705f1c446c7bc393fdbfcdf024a' },
  ] },
  { group: 'Stone', jp: '石', items: [
    { jp: '石橋', use: 'The stream’s bridge', work: 'Men Scryfa Standing Stone', by: 'CISMAS', lic: BY, url: SF + 'men-scryfa-standing-stone-7729f4ead68e482cbc7669bf3488236b' },
    { jp: '飛石', use: 'Stepping stones', work: 'Nordic Nature – Natural Flagstone', by: 'Pixelodda', lic: BY, url: SF + 'nordic-nature-natural-flagstone-8f2237dabfe248559c6ed6dffebccb23' },
    { jp: '灯籠', use: 'Lantern on the roji', work: 'Miyajima Stone lantern 1', by: 'Dawnstar-Chronicles', lic: BY, url: SF + 'miyajima-stone-lantern-1-raw-scan-c0dbdb672b154a94a0c0ef20e017ad44' },
    { jp: '春日灯籠', use: 'Lantern by the basin', work: 'Stone Lantern – Brooklyn Botanic Garden', by: 'Guillermo Sainz', lic: NCSA, url: SF + 'stone-lantern-brooklyn-botanic-garden-812e14251b5c43d1995c82e5bb958bc5' },
    { jp: '雪見灯籠', use: 'Lantern at the water', work: 'Stone lantern scans with iPhone12 Pro', by: 'seirogan', lic: BY, url: SF + 'stone-lantern-scans-with-iphone12-pro-trnio-76e2220436d74461a25e91f4d492c65c' },
    { jp: '角灯籠', model: 'kaku', use: 'Lantern on the far shore', work: 'Japanese stone lantern scan 2', by: 'JabRomich', lic: STD, url: SF + 'japanese-stone-lantern-scan-2-1e90e4f85f7b45e1bc7066ef082a9615' },
    { jp: '蹲踞', use: 'The basins', work: 'Tsukubai scans with iPhone12 Pro', by: 'seirogan', lic: BY, url: SF + 'tsukubai-scans-with-iphone12-pro-221c585db12b4b15be758b293f542975' },
  ] },
  { group: 'In the house', jp: '室内', items: [
    { jp: '茶碗', use: 'Tea bowl', work: 'Japanese Matcha Bowl', by: 'Vision Fountain', lic: BY, url: SF + 'japanese-matcha-bowl-938e05641929403cab1f0c77376e0d9b' },
    { jp: '鉄瓶', use: 'Iron kettle', work: 'Cast Iron Tetsubin', by: 'toomuchtea', lic: BY, url: SF + 'cast-iron-tetsubin-1a49b0714571487d9164b9ba13d03e3f' },
    { jp: '座布団', use: 'Cushions', work: 'Japanese Zabuton', by: 'Geraldo Pratama Wahyu Teddy', lic: BY, url: SF + 'japanese-zabuton-016627cce41a42cfb48db34becd7cbd8' },
    { jp: '下駄', use: 'Geta at the step', work: 'Japanese Geta', by: 'Takuma Nakata', lic: BY, url: SF + 'japanese-geta-f9785f6152484a44bbd73508655a9741' },
    { jp: '行灯', use: 'Paper lamps', work: 'Old Japanese Lamp : Andon', by: 'K', lic: BY, url: SF + 'old-japanese-lamp-andon-0f5cff9fb78b4657b26ddefff4e10fcf' },
  ] },
  { group: 'Paintings', jp: '書画', items: [
    { jp: '松林図屏風', use: 'The screen in the hall', work: 'Pine Trees – Shōrin-zu byōbu – Hasegawa Tōhaku', by: 'xorgol', lic: BY, url: SF + 'pine-trees-shorin-zu-byobu-hasegawa-tohaku-742d33c6904644f8a05b16099034dd55' },
    { jp: '八橋図屏風', use: 'The screen in the next room', work: 'Irises at Yatsuhashi, Ogata Kōrin', by: 'The Metropolitan Museum of Art', lic: CC0, url: 'https://www.metmuseum.org/art/collection/search/39664' },
    { jp: '山水図', use: 'The scroll in the zashiki', work: 'Landscape, Kusumi Morikage', by: 'The Metropolitan Museum of Art', lic: CC0, url: 'https://www.metmuseum.org/art/collection/search/45731' },
    { jp: '一休墨蹟', use: 'The scroll in the tea room', work: 'Naming Certificate for “Tagaku”, Ikkyū Sōjun', by: 'The Metropolitan Museum of Art', lic: CC0, url: 'https://www.metmuseum.org/art/collection/search/913871' },
  ] },
  { group: 'Libraries', jp: '素材', items: [
    { jp: '鯉・枝葉', use: 'Koi, leaf and blossom sprays', work: 'Specimen scans', by: 'ffish.asia / floraZia.com', lic: CC0, url: 'https://sketchfab.com/ffishAsia-and-floraZia' },
    { jp: '石・質感', use: 'Rocks and surfaces', work: 'Scanned models and textures', by: 'Poly Haven', lic: CC0, url: 'https://polyhaven.com' },
    { jp: '質感', use: 'Surfaces', work: 'Scanned materials', by: 'ambientCG', lic: CC0, url: 'https://ambientcg.com' },
  ] },
];
