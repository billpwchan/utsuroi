# Credits

Utsuroi is built from other people's work: stones, trees and objects scanned where they stand, surfaces photographed, paintings opened to the public by their museums. Everything below is used under its licence, with thanks. The same list is in the site's colophon (奥付).

The source code is MIT (see [LICENSE](LICENSE)). The assets under `public/assets/` keep the licences listed here, and the MIT licence does not cover them.

**Changes made.** Every model was converted by `scripts/models.mjs` or `scripts/fetch-assets.mjs`: welded and simplified with meshoptimizer, rescaled to real size, and re-encoded as meshopt glTF or a plain binary, with its textures resized and compressed to KTX2 (Basis Universal). Tree models keep their scanned or modelled wood; their leaves become cards. The foliage atlases are new images composed from renders of the scans (`scripts/bake.mjs`, `scripts/twigs.mjs`). Colour and roughness are adjusted in the shaders at run time.

## Scanned and modelled objects (Sketchfab)

| File (under `public/assets/`) | Used for | Work | By | Licence |
|---|---|---|---|---|
| `glb/sacred_trunk*` | The weeping cherry | [Cherry tree](https://sketchfab.com/3d-models/cherry-tree-232e1f60165342afb09a40230f7a469d) | matousekfoto | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `glb/sakura_tree*` | The cherries | [Japanese Cherry tree](https://sketchfab.com/3d-models/japanese-cherry-tree-ca5a9449555e490cbe726671ed8f95a4) | Nice2meetU2 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `glb/maple_tree.glb`, `maple_tree_lo.glb`, `maple_tree_cards.bin` | Maples | [Tree – Japanese Maple](https://sketchfab.com/3d-models/tree-japanese-maple-89cc344581d94991abce6f9fa0af8be3) | CHEI - UC San Diego | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `glb/maple_tree_b*` | Maples | [Japanese Maple](https://sketchfab.com/3d-models/japanese-maple-d7ad35d2630f40638e93f43dbd5fd28e) | stickbone | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `glb/pine_tree*` | Black pines | [Japanese Black Pine](https://sketchfab.com/3d-models/japanese-black-pine-f0cb4705f1c446c7bc393fdbfcdf024a) | matt z chan | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `glb/bridge*` | The slab over the stream | [Men Scryfa Standing Stone](https://sketchfab.com/3d-models/men-scryfa-standing-stone-7729f4ead68e482cbc7669bf3488236b) | CISMAS | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `glb/flagstone.glb` | Stepping stones | [Nordic Nature – Natural Flagstone](https://sketchfab.com/3d-models/nordic-nature-natural-flagstone-8f2237dabfe248559c6ed6dffebccb23) | Pixelodda | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `glb/toro.glb` | Lantern on the roji | [Miyajima Stone lantern 1 (raw scan)](https://sketchfab.com/3d-models/miyajima-stone-lantern-1-raw-scan-c0dbdb672b154a94a0c0ef20e017ad44) | Dawnstar-Chronicles | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `glb/kasuga.glb` **(non-commercial)** | Lantern by the basin | [Stone Lantern – Brooklyn Botanic Garden](https://sketchfab.com/3d-models/stone-lantern-brooklyn-botanic-garden-812e14251b5c43d1995c82e5bb958bc5) | Guillermo Sainz | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |
| `glb/yukimi.glb` | Lantern at the water | [Stone lantern scans with iPhone12 Pro (Trnio)](https://sketchfab.com/3d-models/stone-lantern-scans-with-iphone12-pro-trnio-76e2220436d74461a25e91f4d492c65c) | seirogan | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `glb/tsukubai.glb` | The basins | [Tsukubai scans with iPhone12 Pro](https://sketchfab.com/3d-models/tsukubai-scans-with-iphone12-pro-221c585db12b4b15be758b293f542975) | seirogan | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `glb/chawan.glb` | Tea bowl | [Japanese Matcha Bowl](https://sketchfab.com/3d-models/japanese-matcha-bowl-938e05641929403cab1f0c77376e0d9b) | Vision Fountain | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `glb/tetsubin.glb` | Iron kettle | [Cast Iron Tetsubin](https://sketchfab.com/3d-models/cast-iron-tetsubin-1a49b0714571487d9164b9ba13d03e3f) | toomuchtea | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `glb/zabuton.glb` | Cushions | [Japanese Zabuton](https://sketchfab.com/3d-models/japanese-zabuton-016627cce41a42cfb48db34becd7cbd8) | Geraldo Pratama Wahyu Teddy | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `glb/geta.glb` | Geta at the step | [Japanese Geta](https://sketchfab.com/3d-models/japanese-geta-f9785f6152484a44bbd73508655a9741) | Takuma Nakata | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `glb/andon.glb` | Paper lamps | [Old Japanese Lamp : Andon](https://sketchfab.com/3d-models/old-japanese-lamp-andon-0f5cff9fb78b4657b26ddefff4e10fcf) | K | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `glb/koi*` | Koi | [コイ Carp, Cyprinus carpio](https://sketchfab.com/3d-models/cc0-carp-cyprinus-carpio-6b404d20bab34fa99fba848060c42ca7) | ffish.asia / floraZia.com | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `tex/hedge_c`, `tex/hedge_n` | Clipped shrubs | [Hedge 01](https://sketchfab.com/3d-models/hedge-01-a4eff014b1a84d478d7297acf4eb6160) | Publicdomaintextures | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `tex/byobu_pine_c` | The screen in the genkan | [Pine Trees – Shōrin-zu byōbu – Hasegawa Tōhaku](https://sketchfab.com/3d-models/pine-trees-shorin-zu-byobu-hasegawa-tohaku-742d33c6904644f8a05b16099034dd55) | xorgol | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

## Foliage, from specimen scans

The leaf and blossom atlases are composed from the CC0 scans that [ffish.asia / floraZia.com](https://sketchfab.com/ffishAsia-and-floraZia) publish, at the specimens' true size.

| File (under `public/assets/`) | Used for | Work | By | Licence |
|---|---|---|---|---|
| `foliage/blossom_*`, `foliage/umbel_*`, `stamps/sakura_*` | Cherry blossom | [桜ソメイヨシノ Sakura Cherry Blossom](https://sketchfab.com/3d-models/cc0-sakura-cherry-blossom-f5e6f5a985ea4fc2a14ee0b4b37572b5) | ffish.asia / floraZia.com | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
|  |  | [桜ソメイヨシノ さくら 染井吉野 Sakura Cherry Blossom](https://sketchfab.com/3d-models/cc0-sakura-cherry-blossom-5065502198a84e0a9b0477ba18131f99) | ffish.asia / floraZia.com | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `foliage/maple_*`, `stamps/maple_*` | Maple leaves | [イロハモミジ Japanese Maple, Acer palmatum](https://sketchfab.com/3d-models/cc0-japanese-maple-acer-palmatum-889aca0c32e64d84b03c1630246b4d7b) | ffish.asia / floraZia.com | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `foliage/pine_*` | Pine needles | [クロマツ Japanese Black Pine, P. thunbergii](https://sketchfab.com/3d-models/cc0-japanese-black-pine-p-thunbergii-4bd517f34ad84640a4387ec9c5e72899) | ffish.asia / floraZia.com | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `foliage/sugi_*` | Cedar sprays | [スギ Japanese Cedar, Cryptomeria japonica](https://sketchfab.com/3d-models/cc0-japanese-cedar-cryptomeria-japonica-930e1a9369a04c9a85281b4085e44507) | ffish.asia / floraZia.com | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `foliage/karikomi*` | Clipped shrubs | [マサキ Japanese Spindle Tree, E. japonicus](https://sketchfab.com/3d-models/cc0-japanese-spindle-tree-e-japonicus-179cde07ea5c40d39eb91b90b3c43370) | ffish.asia / floraZia.com | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `foliage/karikomiBloom_*` | Azalea flowers | [サツキ Satsuki Azalea, Rhododendron indicum](https://sketchfab.com/3d-models/cc0-satsuki-azalea-rhododendron-indicum-769234ce5f6c49ab89e51aedcc0eed4c) | ffish.asia / floraZia.com | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `foliage/sasa*` | Bamboo grass | [クマザサ Kuma Bamboo Grass, Sasa veitchii](https://sketchfab.com/3d-models/cc0-kuma-bamboo-grass-sasa-veitchii-82813fd053e94e28886761a1a9024551) | ffish.asia / floraZia.com | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `foliage/leaves_*` | Broadleaf trees | [スモモ Japanese Plum, Prunus salicina](https://sketchfab.com/3d-models/cc0-japanese-plum-prunus-salicina-4f90a2b9d969407e9f84e68f2932a9ab) | ffish.asia / floraZia.com | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |

## Paintings and scrolls

| File | Used for | Work | Source | Licence |
|---|---|---|---|---|
| `tex/byobu_korin_c` | The screen in the next room | *Irises at Yatsuhashi (Eight Bridges)*, Ogata Kōrin | [The Metropolitan Museum of Art](https://www.metmuseum.org/art/collection/search/39664) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `tex/scroll_morikage_c` | The scroll in the zashiki | *Landscape*, Kusumi Morikage | [The Metropolitan Museum of Art](https://www.metmuseum.org/art/collection/search/45731) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `tex/scroll_ikkyu_c` | The scroll in the tea room | *Naming Certificate for "Tagaku"*, Ikkyū Sōjun | [The Metropolitan Museum of Art](https://www.metmuseum.org/art/collection/search/913871) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |

Hasegawa Tōhaku's *Pine Trees* screen in the genkan is the CC BY scan listed with the objects above.

## Surfaces and rocks

[Poly Haven](https://polyhaven.com) (CC0): the textures `tatami_mat`, `hinoki_planks`, `clay_plaster`, `worn_mossy_plasterwall`, `japanese_cedar_planks`, `japanese_stone_wall`, `gravel_floor_02`, `clay_floor_001`, `slate_floor_03`, `pine_bark`, `trident_maple_bark`, `japanese_cedar_bark`, `sakura_bark`, `rough_linen`, `bamboo_veneer`, `forrest_ground_01`, `ganges_river_pebbles` and `forest_leaves_04` (`ground_np_r` packs two of their normal maps), and the models `fern_02`, `rock_moss_set_01`, `rock_moss_set_02`, `rock_07`, `rock_09`, `namaqualand_boulder_02` and `namaqualand_boulder_05`.

[ambientCG](https://ambientcg.com) (CC0): `Moss001` (`tex/sugigoke_c`) and `Moss002` (`tex/moss_a_c`).

## Two licences to know about

- **`glb/kasuga.glb` is CC BY-NC-SA 4.0.** It may be shared and adapted for non-commercial use, under the same licence. Replace it before using this project commercially.
- **One lantern is not in this repository.** The square lantern on the far shore of the author's own build is under the Sketchfab Standard licence, which does not allow redistributing the file. Without it the garden stands the Miyajima lantern in its place. To restore it locally, fetch it with your own Sketchfab API token, `scripts/sketchfab.sh lantern_sq 1e90e4f85f7b45e1bc7066ef082a9615`, then run `node scripts/models.mjs kaku`.

| File | Used for | Work | By | Licence |
|---|---|---|---|---|
| `glb/kaku.glb` (not in this repository) | Lantern on the far shore | [japanese stone lantern scan 2](https://sketchfab.com/3d-models/japanese-stone-lantern-scan-2-1e90e4f85f7b45e1bc7066ef082a9615) | JabRomich | [Sketchfab Standard](https://sketchfab.com/licenses) |

## Everything else

The house, its joinery and roofs, the terrain, the water, the sky, the bamboo and the far hills are procedural, written for this project. The baked light under `lm/` was rendered for it in Blender Cycles. The sound is synthesised in the browser. Nothing is recorded.

- [three.js](https://threejs.org) (MIT) renders it all. Its KTX2 loader uses the [Basis Universal](https://github.com/BinomialLLC/basis_universal) transcoder in `public/basis/` (Apache 2.0, licence text in `public/basis/LICENSE.txt`).
- Type: [Shippori Mincho B1](https://fonts.google.com/specimen/Shippori+Mincho+B1), [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond) and [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono), all SIL Open Font License, served by Google Fonts.
- The idea of walking a Japanese house through one day owes a debt to Meng To's [Seijaku](https://x.com/MengTo/status/2099898247959691523).
