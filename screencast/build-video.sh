#!/bin/bash
# Assemble the four recorded segments into one mp4, speed-adjusted to
# ~30s (search) + ~10s each (messaging, prayer, donation).
set -e
DIR=/tmp/ergatas-screencast
OUT="${1:-/home/khoran/OneDrive/foreign orgs/ergatas-demo.mp4}"

dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

S=$(dur $DIR/search.webm)
M=$(dur $DIR/messaging.webm)
P=$(dur $DIR/prayer.webm)
D=$(dur $DIR/donation.webm)

FS=$(echo "$S / 30" | bc -l)
FM=$(echo "$M / 10" | bc -l)
FP=$(echo "$P / 10" | bc -l)
FD=$(echo "$D / 10" | bc -l)
echo "speed factors: search=$FS messaging=$FM prayer=$FP donation=$FD"

ffmpeg -y -v error \
  -i $DIR/search.webm -i $DIR/messaging.webm -i $DIR/prayer.webm -i $DIR/donation.webm \
  -filter_complex "\
[0:v]setpts=PTS/$FS,fps=30[v0];\
[1:v]setpts=PTS/$FM,fps=30[v1];\
[2:v]setpts=PTS/$FP,fps=30[v2];\
[3:v]setpts=PTS/$FD,fps=30[v3];\
[v0][v1][v2][v3]concat=n=4:v=1:a=0[v]" \
  -map "[v]" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart \
  "$OUT"

echo "wrote $OUT ($(dur "$OUT")s)"
