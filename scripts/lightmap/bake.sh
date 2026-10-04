#!/usr/bin/env bash
# The house's baked light, end to end: export the receivers from the running dev page, bake sky, lamps and seven sun
# hours in Cycles, denoise with OIDN, pull the lamp map's leftover fireflies, encode to public/assets/lm.
# About 35 minutes of GPU time on an M4 Max. Needs Blender 4.2+ (BLENDER=<path> if it is not on PATH) and basisu.
# usage: npm run dev (in another shell), then scripts/lightmap/bake.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
B=${BLENDER:-$(command -v blender || echo /Applications/Blender.app/Contents/MacOS/Blender)}
O=.cache/lm/full
LOG=.cache/lm/run.log
mkdir -p "$O"
: > "$LOG"
run() { "$B" -b -P "scripts/lightmap/$1" -- "${@:2}" >> "$LOG" 2>&1; }

node scripts/lightmap/export.mjs
# bases, map size, samples, sun map size, sun samples
run bake.py .cache/lm/scene.glb .cache/lm/meta.json "$O" sky 4096 3072 2048 1024
run bake.py .cache/lm/scene.glb .cache/lm/meta.json "$O" lamp,sun:6,sun:7.5,sun:9,sun:11.5,sun:14.5,sun:16.5,sun:18 4096 2048 2048 1024
for n in sky lamp; do run denoise.py "$O/$n.exr" "$O/guide_nrm_4096.exr" "$O/guide_id_4096.exr" "$O/$n.f32"; done
for f in "$O"/sun_*.exr; do
  # the compositor's own intermediates share the prefix
  case $f in *.f32.exr) continue ;; esac
  n=$(basename "$f" .exr)
  run denoise.py "$f" "$O/guide_nrm_2048.exr" "$O/guide_id_2048.exr" "$O/$n.f32"
done
cp "$O/lamp.f32" .cache/lm/lamp.denoised.f32
run clean.py .cache/lm/lamp.denoised.f32 "$O/guide_nrm_4096.exr" "$O/guide_id_4096.exr" "$O/lamp.f32"
node scripts/lightmap/encode.mjs "$O"
