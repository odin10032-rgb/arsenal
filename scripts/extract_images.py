#!/usr/bin/env python3
"""Extrait les URLs d'images depuis les réponses de z-ai image-search."""
import json, glob, os

def extract_json(path):
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    idx = raw.find("{")
    if idx == -1:
        return None
    return json.loads(raw[idx:])

for path in sorted(glob.glob("/tmp/imgsearch/*.json")):
    name = os.path.basename(path).replace(".json", "")
    try:
        d = extract_json(path)
    except Exception as e:
        print(f"== {name} == ERREUR: {e}")
        continue
    if not d or not d.get("success"):
        print(f"== {name} == échec")
        continue
    print(f"== {name} ==")
    for i, r in enumerate(d.get("results", [])):
        try:
            w = int(str(r.get("original_width", "0")).replace("px", "") or 0)
            h = int(str(r.get("original_height", "0")).replace("px", "") or 0)
            ratio = round(w / h, 2) if h else 0
        except Exception:
            ratio = 0
        print(f"  [{i}] {r['original_url']} | ratio={ratio} | {r.get('source','?')}")
