"""Add the 65 held Yuu-area municipal GTFS records without changing existing stops."""
from __future__ import annotations

from collections import defaultdict
import csv
import io
import json
from pathlib import Path
import zipfile


ROOT = Path(__file__).resolve().parents[1]
FEED = ROOT / "data-sources/iwakuni-directed-20260915/official-20260327.zip"
STOPS_PATH = ROOT / "public/data/review-stops.geojson"
STUDY_PATH = ROOT / "src/data/boarding-guide-study.json"
REPORT_PATH = ROOT / "work/iwakuni-yuu-20260915/adoption.json"
SOURCE_URL = "https://yamaguchi-opendata.jp/ckan/dataset/352080-gtfsjp"
GUIDE_URL = "https://www.city.iwakuni.lg.jp/soshiki/61/115174.html"
LICENSE_URL = "https://www.city.iwakuni.lg.jp/soshiki/8/36369.html"


with zipfile.ZipFile(FEED) as archive:
    def table(name: str) -> list[dict[str, str]]:
        return list(csv.DictReader(io.StringIO(archive.read(f"{name}.txt").decode("utf-8-sig"))))

    source_stops = {row["stop_id"]: row for row in table("stops")}
    source_routes = {row["route_id"]: row for row in table("routes")}
    source_trips = {row["trip_id"]: row for row in table("trips")}
    stop_times = table("stop_times")

catalog = json.loads(STOPS_PATH.read_text(encoding="utf-8"))
study = json.loads(STUDY_PATH.read_text(encoding="utf-8"))
before_features = json.loads(json.dumps(catalog["features"], ensure_ascii=False))
before_guides = json.loads(json.dumps(study["guides"], ensure_ascii=False))
existing_ids = {str(feature["id"]) for feature in catalog["features"]}
existing_iwakuni_ids = {
    feature["properties"]["source_stop_id"]
    for feature in catalog["features"]
    if feature["properties"]["source_namespace"] == "iwakuni"
}
held_ids = sorted(set(source_stops) - existing_iwakuni_ids)
assert len(source_stops) == 800 and len(existing_iwakuni_ids) == 735 and len(held_ids) == 65

sequences: dict[str, list[dict[str, str]]] = defaultdict(list)
for row in stop_times:
    sequences[row["trip_id"]].append(row)
for sequence in sequences.values():
    sequence.sort(key=lambda row: int(row["stop_sequence"]))

occurrences: dict[str, list[dict[str, object]]] = defaultdict(list)
for trip_id, sequence in sequences.items():
    trip = source_trips[trip_id]
    for index, row in enumerate(sequence):
        if row["stop_id"] not in held_ids:
            continue
        occurrences[row["stop_id"]].append({
            "route_id": trip["route_id"],
            "headsign": trip.get("trip_headsign", "").strip(),
            "pickup": row.get("pickup_type", "0") != "1",
            "drop_off": row.get("drop_off_type", "0") != "1",
            "previous_stop_id": sequence[index - 1]["stop_id"] if index else None,
            "next_stop_id": sequence[index + 1]["stop_id"] if index + 1 < len(sequence) else None,
        })

added = []
for stop_id in held_ids:
    source = source_stops[stop_id]
    feature_id = f"iwakuni:{stop_id}"
    assert feature_id not in existing_ids and feature_id not in study["guides"]
    coordinate = [float(source["stop_lon"]), float(source["stop_lat"])]
    route_ids = sorted({item["route_id"] for item in occurrences[stop_id]})
    assert route_ids and all(route_id in source_routes for route_id in route_ids)
    feature = {
        "type": "Feature",
        "id": feature_id,
        "geometry": {"type": "Point", "coordinates": coordinate},
        "properties": {
            "source_namespace": "iwakuni",
            "source_stop_id": stop_id,
            "name": source["stop_name"],
            "route_ids": [f"iwakuni:{route_id}" for route_id in route_ids],
            "source_url": SOURCE_URL,
            "source_date": "2026-03-27",
            "verified_at": "2026-09-15",
            "license": "CC-BY-4.0",
            "license_source_url": LICENSE_URL,
            "boarding_side": None,
            "physical_stop_group_id": None,
            "stale_route_warning": False,
            "operator_unresolved": True,
            "service_today": None,
            "coordinate_status": "official-source-not-field-verified",
            "publication_status": "ready-as-separate-source-layer",
        },
    }
    catalog["features"].append(feature)

    boardings = [item for item in occurrences[stop_id] if item["pickup"]]
    drop_off_only = not boardings and any(item["drop_off"] for item in occurrences[stop_id])
    assert boardings or drop_off_only
    directions = []
    for route_id in route_ids:
        route_boardings = [item for item in boardings if item["route_id"] == route_id]
        if not route_boardings:
            continue
        headsigns = sorted({item["headsign"] for item in route_boardings if item["headsign"]})
        next_ids = sorted({item["next_stop_id"] for item in route_boardings if item["next_stop_id"]})
        next_names = sorted({source_stops[next_id]["stop_name"] for next_id in next_ids})
        directions.append({
            "route": source_routes[route_id].get("route_long_name") or source_routes[route_id].get("route_short_name"),
            "text": "／".join(headsigns) + "方面",
            "next_stops": next_names,
        })
    headsigns = sorted({item["headsign"] for item in boardings if item["headsign"]})
    summary = "／".join(headsigns) + "方面" if headsigns else "この資料では降車専用として登録"
    guide = {
        "group_id": f"iwakuni:{source['stop_name']}",
        "number": source.get("platform_code") or None,
        "role": "alighting" if drop_off_only else "boarding",
        "summary": summary,
        "directions": directions,
        "source_url": SOURCE_URL,
        "guide_url": GUIDE_URL,
        "data_notice": "方面は2026年3月27日改正の岩国市公式GTFSによります。徒歩圏は道路接続の確認後に追加します。",
        "evidence": "stop-sequence",
        "source_coordinates": coordinate,
        "location_description": "岩国市公式GTFSの原ID・原座標を表示しています。道路側・標柱位置は現地未確認です。",
        "roadside_review": {
            "status": "hold",
            "direction_status": "source-sequence-checked",
            "reason": "公式GTFSで原点と方面を確認。道路側と標柱位置は未確認。",
            "walking_notice": "この原点の道路接続を確認するまで徒歩圏を表示しません。",
        },
    }
    study["guides"][feature_id] = guide
    added.append({
        "id": feature_id,
        "name": source["stop_name"],
        "coordinates": coordinate,
        "role": guide["role"],
        "summary": summary,
        "route_ids": route_ids,
    })

assert catalog["features"][:len(before_features)] == before_features
assert all(study["guides"].get(key) == value for key, value in before_guides.items())
assert len({str(feature["id"]) for feature in catalog["features"]}) == len(catalog["features"])
assert len(added) == 65 and sum(row["role"] == "boarding" for row in added) == 64

STOPS_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
STUDY_PATH.write_text(json.dumps(study, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
REPORT_PATH.write_text(json.dumps({
    "source": str(FEED.relative_to(ROOT)),
    "source_url": SOURCE_URL,
    "license": "CC BY 4.0",
    "license_source_url": LICENSE_URL,
    "existing_iwakuni_points_preserved": len(existing_iwakuni_ids),
    "added_points": len(added),
    "boarding_points": sum(row["role"] == "boarding" for row in added),
    "alighting_points": sum(row["role"] == "alighting" for row in added),
    "walking_catchments_added": 0,
    "points": added,
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"preserved": len(existing_iwakuni_ids), "added": len(added), "boarding": 64, "alighting": 1}, ensure_ascii=False))
