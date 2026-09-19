"""Verify the bounded Yuu-area adoption against the last published commit and official GTFS."""
from collections import defaultdict
import csv
import io
import json
from pathlib import Path
import subprocess
import zipfile


ROOT = Path(__file__).resolve().parents[1]
BASE = "4a2275dee19f083559d517c67fb4b952e7117586"


def baseline(path: str) -> dict:
    raw = subprocess.run(["git", "show", f"{BASE}:{path}"], cwd=ROOT, capture_output=True, check=True).stdout
    return json.loads(raw)


old_catalog = baseline("public/data/review-stops.geojson")
old_study = baseline("src/data/boarding-guide-study.json")
catalog = json.loads((ROOT / "public/data/review-stops.geojson").read_text(encoding="utf-8"))
study = json.loads((ROOT / "src/data/boarding-guide-study.json").read_text(encoding="utf-8"))
assert catalog["features"][:len(old_catalog["features"])] == old_catalog["features"]
assert all(study["guides"][key] == value for key, value in old_study["guides"].items())

with zipfile.ZipFile(ROOT / "data-sources/iwakuni-directed-20260915/official-20260327.zip") as archive:
    def table(name: str) -> list[dict[str, str]]:
        return list(csv.DictReader(io.StringIO(archive.read(f"{name}.txt").decode("utf-8-sig"))))

    source_stops = {row["stop_id"]: row for row in table("stops")}
    trips = {row["trip_id"]: row for row in table("trips")}
    stop_times = table("stop_times")

old_iwakuni = {
    feature["properties"]["source_stop_id"]
    for feature in old_catalog["features"]
    if feature["properties"]["source_namespace"] == "iwakuni"
}
held_ids = set(source_stops) - old_iwakuni
added = [feature for feature in catalog["features"] if feature["properties"]["source_stop_id"] in held_ids]
assert len(old_iwakuni) == 735 and len(held_ids) == len(added) == 65

headsigns: dict[str, set[str]] = defaultdict(set)
pickup_seen: dict[str, bool] = defaultdict(bool)
for row in stop_times:
    if row["stop_id"] not in held_ids:
        continue
    if row.get("pickup_type", "0") != "1":
        pickup_seen[row["stop_id"]] = True
        if trips[row["trip_id"]].get("trip_headsign"):
            headsigns[row["stop_id"]].add(trips[row["trip_id"]]["trip_headsign"])

by_name: dict[str, list[str]] = defaultdict(list)
old_walk = baseline("src/data/boarding-walk-study/index.json")["stops"]
walk_index = json.loads((ROOT / "src/data/boarding-walk-study/index.json").read_text(encoding="utf-8"))["stops"]
assert all(walk_index[stop_id] == entry for stop_id, entry in old_walk.items())
for feature in added:
    stop_id = feature["properties"]["source_stop_id"]
    source = source_stops[stop_id]
    assert feature["geometry"]["coordinates"] == [float(source["stop_lon"]), float(source["stop_lat"])]
    guide = study["guides"][feature["id"]]
    assert guide["source_coordinates"] == feature["geometry"]["coordinates"]
    assert guide["role"] == ("boarding" if pickup_seen[stop_id] else "alighting")
    assert headsigns[stop_id] <= set(guide["summary"].removesuffix("方面").split("／"))
    by_name[source["stop_name"]].append(stop_id)

pairs = [stop_ids for stop_ids in by_name.values() if len(stop_ids) == 2]
assert len(pairs) == 19
for first, second in pairs:
    assert headsigns[first] != headsigns[second]
assert sum(not pickup_seen[stop_id] for stop_id in held_ids) == 1
assert study["guides"]["iwakuni:630_02"]["role"] == "alighting"
new_walk = {stop_id: walk_index[stop_id] for stop_id in walk_index.keys() - old_walk.keys()}
assert len(new_walk) == 19
assert sum(bool(entry.get("file")) for entry in new_walk.values()) == 13
assert sum(not entry.get("file") for entry in new_walk.values()) == 6
assert all(entry["origin"] == study["guides"][stop_id]["source_coordinates"] for stop_id, entry in new_walk.items())
classification = json.loads((ROOT / "data-sources/iwakuni-yuu-singletons-20260915/classification.json").read_text(encoding="utf-8"))
assert classification["summary"]["points"] == 27
for record in classification["records"]:
    guide = study["guides"][record["id"]]
    assert guide["roadside_review"]["status"] == "hold"
    assert record["classification"] in guide["roadside_review"]["reason"] or {
        "同一公式点で道路側判定が方向により反転": "道路側判定が反転",
        "不整合のみで乗降側を確認できない": "乗降側の整合を確認できません",
        "曲折・分岐・起終点等で判定不能": "曲折・分岐・起終点",
    }[record["classification"]] in guide["roadside_review"]["reason"]
    assert record["id"] not in walk_index
for stop_id, entry in new_walk.items():
    if not entry.get("file"):
        assert "未計算" in study["guides"][stop_id]["roadside_review"]["walking_notice"]
print("Iwakuni Yuu: preserved 735; added 65 official points; 19 direction-distinct pairs; walking 13 calculated + 6 uncomputed; 27 singleton holds classified.")
