#!/bin/bash
# Album « Scavengers » du jukebox : les six ambiances du jeu (https://scavengers.elitedangereuse.fr),
# que le jeu mixe en direct à partir de trois couches (nappe, pulsation, thème), fondues ici en un
# MP3 par ambiance, aux dosages du jeu (MusicStemLibrary.ts). Chaque boucle tourne trois fois (deux
# pour la plus longue), finit en fondu, et est ramenée au niveau des autres albums (-15 LUFS).
#
# Usage : scripts/mix-scavengers-music.sh /chemin/vers/scavengers
set -euo pipefail
SRC="${1:?dépôt de Scavengers}/public/audio/music"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/assets/music"
TARGET=-15
FADE=6

# ambiance:tours:nappe:pulsation:thème
TRACKS=(
  "title:3:0.88:0.52:0.6"
  "galaxy:3:0.82:0.6:0.62"
  "mission:3:0.72:0.48:0.46"
  "mission_tense:3:0.68:0.66:0.42"
  "management:3:0.84:0.55:0.63"
  "gameover:2:0.92:0.22:0.56"
)

n=0
for track in "${TRACKS[@]}"; do
  IFS=: read -r mood loops bed pulse lead <<<"$track"
  n=$((n + 1))
  once=$(afinfo "$SRC/$mood-bed.m4a" | awk '/estimated duration/ { print $3 }')
  length=$(echo "$once * $loops" | bc -l)
  inputs=()
  for stem in bed pulse lead; do inputs+=(-stream_loop $((loops - 1)) -i "$SRC/$mood-$stem.m4a"); done
  mix="[0:a]volume=$bed[a];[1:a]volume=$pulse[b];[2:a]volume=$lead[c];[a][b][c]amix=inputs=3:normalize=0,atrim=0:$length"
  # Première passe : le niveau du mélange ; seconde : le gain qui l'amène à la cible, puis le fondu.
  loud=$(ffmpeg -hide_banner -nostats "${inputs[@]}" -filter_complex "$mix,ebur128" -f null - 2>&1 | awk '/I:/ { v = $2 } END { print v }')
  gain=$(echo "$TARGET - ($loud)" | bc -l)
  out="$OUT/scavengers-0$n.mp3"
  ffmpeg -hide_banner -loglevel error -y "${inputs[@]}" \
    -filter_complex "$mix,volume=${gain}dB,alimiter=limit=0.89,afade=t=out:st=$(echo "$length - $FADE" | bc -l):d=$FADE" \
    -map_metadata -1 -ar 48000 -c:a libmp3lame -b:a 192k "$out"
  printf '%s  %s tours  %+.1f dB  %s\n' "$(basename "$out")" "$loops" "$gain" "$(afinfo "$out" | awk '/estimated duration/ { print $3 }') s"
done
