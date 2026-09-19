"""Fetch full OSM road records around the 19 two-point Yuu stop groups."""
from __future__ import annotations

import datetime
import argparse
import hashlib
import json
import math
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--singletons", action="store_true")
parser.add_argument("--out", type=Path, default=ROOT / "data-sources/iwakuni-yuu-directed-20260915")
args = parser.parse_args()
OUT = args.out
INVENTORY = ROOT / "work/iwakuni-held-65-inventory.json"
OUT.mkdir(parents=True, exist_ok=True)

inventory = json.loads(INVENTORY.read_text(encoding="utf-8"))
points = {point["source_stop_id"]: point for point in inventory["points"]}
pairs = []
groups = inventory["pair_comparisons"]
if args.singletons:
    groups = [{"name": point["name"], "sides": [{"source_stop_id": point["source_stop_id"]}]}
              for point in inventory["points"] if point["same_name_held_count"] == 1]
for comparison in groups:
    stop_ids = [side["source_stop_id"] for side in comparison["sides"]]
    coordinates = [points[stop_id]["coordinates"] for stop_id in stop_ids]
    distance = 0 if len(coordinates) == 1 else math.hypot(
        (coordinates[0][0] - coordinates[1][0]) * 92300,
        (coordinates[0][1] - coordinates[1][1]) * 111320)
    pairs.append({"stop_name": comparison["name"], "stop_ids": stop_ids, "distance_m": round(distance, 1)})
(OUT / "selected-pairs.json").write_text(json.dumps(pairs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

elements: dict[tuple[str, str], dict[str, object]] = {}
receipts = []
for pair in pairs:
    coordinates = [points[stop_id]["coordinates"] for stop_id in pair["stop_ids"]]
    south = min(point[1] for point in coordinates) - .0012
    west = min(point[0] for point in coordinates) - .0015
    north = max(point[1] for point in coordinates) + .0012
    east = max(point[0] for point in coordinates) + .0015
    filename = "map-" + pair["stop_ids"][0].replace("/", "-") + ".osm"
    source = OUT / filename
    url = "https://api.openstreetmap.org/api/0.6/map?bbox=" + ",".join(map(str, [west, south, east, north]))
    if not source.exists():
        with urllib.request.urlopen(url, timeout=45) as response:
            source.write_bytes(response.read())
    payload = source.read_bytes()
    for element in ET.fromstring(payload):
        if element.tag not in {"node", "way"}:
            continue
        tags = {tag.get("k"): tag.get("v") for tag in element.findall("tag")}
        if element.tag == "way" and "highway" not in tags:
            continue
        item: dict[str, object] = {"type": element.tag, "id": int(element.get("id")), "tags": tags}
        if element.tag == "node":
            item.update(lon=float(element.get("lon")), lat=float(element.get("lat")))
        else:
            item["nodes"] = [int(node.get("ref")) for node in element.findall("nd")]
        elements[element.tag, element.get("id")] = item
    receipts.append({
        "name": pair["stop_name"], "file": filename, "url": url,
        "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest(),
    })
    print("road source", pair["stop_name"], len(payload), flush=True)

(OUT / "carriageways-yuu.json").write_text(json.dumps({"elements": list(elements.values())}, ensure_ascii=False) + "\n", encoding="utf-8")
(OUT / "map-receipts.json").write_text(json.dumps({
    "retrieved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "provider": "OpenStreetMap public map API",
    "records": receipts,
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"pairs": len(pairs), "road_elements": len(elements)}, ensure_ascii=False))
