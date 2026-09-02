#!/bin/bash
# Collecte d'images de couverture pour les produits Bêta Arsenal (via z-ai image-search)
OUT=/tmp/imgsearch
mkdir -p "$OUT"

run() {
  local name="$1"; local query="$2"
  z-ai image-search -q "$query" --count 3 --gl us --no-rank -o "$OUT/$name.json" 2>"$OUT/$name.err" || echo "FAIL $name" >> "$OUT/errors.log"
}

# Lot 1
run saas "dark futuristic SaaS analytics dashboard interface glowing purple charts" &
run screenshot "web browser automation screenshot website capture dark tech" &
run clipboard "clipboard manager app computer productivity interface" &
run terminal "terminal command line green code dark screen close up" &
wait

# Lot 2
run water "water drinking reminder health app on smartphone" &
run pomodoro "pomodoro focus timer productivity app on phone" &
run ebook "reading ebook on tablet at night dark ambient" &
run prompts "AI chatbot conversation prompt futuristic neon interface" &
wait

# Lot 3
run automation "workflow automation connected nodes diagram dark background" &
run social "social media content calendar planner dashboard" &
run code "programming code editor dark screen neon" &
run mockup "digital product bundle presentation dark purple neon" &
wait

echo "DONE" > "$OUT/complete.flag"
