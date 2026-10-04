#!/bin/zsh
# sheet.sh out.png in1 in2 ... : 2-column contact sheet at 800px wide tiles
out=$1; shift
args=(); filt=""; i=0
for f in "$@"; do args+=(-i "$f"); filt+="[$i:v]scale=800:-1[v$i];"; i=$((i+1)); done
if (( i % 2 == 1 )); then args+=(-f lavfi -i "color=black:s=800x450"); filt+="[$i:v]null[v$i];"; i=$((i+1)); fi
rows=""; r=0
for ((k=0; k<i; k+=2)); do filt+="[v$k][v$((k+1))]hstack[r$r];"; rows+="[r$r]"; r=$((r+1)); done
if (( r > 1 )); then filt+="${rows}vstack=inputs=$r"; else filt="${filt%;}"; filt="${filt%\[r0\]}"; fi
ffmpeg -loglevel error -y "${args[@]}" -filter_complex "$filt" -frames:v 1 "$out"
