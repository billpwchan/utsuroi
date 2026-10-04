#!/usr/bin/env bash
# Fetch a Sketchfab model into .cache/src-assets/sf/<name>, where scripts/models.mjs reads it. The glTF archive keeps
# the original textures; the glb is Sketchfab's compressed copy, with textures cut to 1K.
# usage: SKETCHFAB_TOKEN=<api token> scripts/sketchfab.sh <name> <model uid>   (or the token in ~/.config/sketchfab/token)
set -euo pipefail
cd "$(dirname "$0")/.."
name=$1 uid=$2
D=.cache/src-assets/sf/$name
[ -d "$D" ] && { echo "skip $name"; exit 0; }
TOKEN=${SKETCHFAB_TOKEN:-$(cat ~/.config/sketchfab/token)}
j=$(curl -s --max-time 60 -H "Authorization: Token $TOKEN" "https://api.sketchfab.com/v3/models/$uid/download")
url=$(echo "$j" | jq -r '.gltf.url // empty') ext=zip
[ -z "$url" ] && { url=$(echo "$j" | jq -r '.glb.url // empty'); ext=glb; }
[ -z "$url" ] && { echo "no download for $name: $(echo "$j" | head -c 300)"; exit 1; }
mkdir -p "$D"
if [ $ext = glb ]; then
  curl -s --max-time 900 "$url" -o "$D/model.glb"
else
  curl -s --max-time 900 "$url" -o "$D/source.zip"
  unzip -q -o "$D/source.zip" -d "$D"
fi
echo "$name $ext $(du -sh "$D" | cut -f1)"
