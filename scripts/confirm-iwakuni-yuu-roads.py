"""Apply only individually confirmed Yuu road-side audits and prepare walking inputs."""
from __future__ import annotations

import json
from pathlib import Path
import urllib.parse


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data-sources/iwakuni-yuu-directed-20260915"
STUDY_PATH = ROOT / "src/data/boarding-guide-study.json"

ledger = json.loads((SOURCE / "ledger.json").read_text(encoding="utf-8"))
study = json.loads(STUDY_PATH.read_text(encoding="utf-8"))
confirmed = []
held = []
for group in ledger["pairs"]:
    for point in group["points"]:
        guide = study["guides"][point["id"]]
        assert point["id"].startswith("iwakuni:") and "2026年3月27日改正" in guide["data_notice"]
        if point["status"] == "机上確認済み":
            guide["roadside_review"] = {
                "status": "confirmed",
                "direction_status": "source-sequence-checked",
                "reason": "公式GTFSの停車順・shapeと取得時点の道路線を照合し、進行方向に対する原点の道路側を机上確認。現地標柱は未確認。",
                "walking_notice": "原座標から30m以内の歩行可能道路へ接続して徒歩圏を計算しています。現地の通行状態は未確認です。",
            }
            confirmed.append(point["id"])
        else:
            reasons = sorted({reason for occurrence in point["occurrences"] for reason in occurrence["reasons"]})
            held.append({"id": point["id"], "name": group["name"], "reasons": reasons or ["乗車記録または前後区間が不足"]})

assert len(confirmed) == ledger["summary"]["confirmed_points"] == 19
STUDY_PATH.write_text(json.dumps(study, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(SOURCE / "walking-target-ids.json").write_text(json.dumps(confirmed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(SOURCE / "held-roadside.json").write_text(json.dumps(held, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

roads = json.loads((SOURCE / "carriageways-yuu.json").read_text(encoding="utf-8"))
nodes = {str(item["id"]): [item["lon"], item["lat"], item.get("tags", {})] for item in roads["elements"] if item["type"] == "node"}
ways = [{"id": str(item["id"]), "refs": [str(node) for node in item["nodes"]], "tags": item["tags"]}
        for item in roads["elements"] if item["type"] == "way"]
receipts = json.loads((SOURCE / "map-receipts.json").read_text(encoding="utf-8"))["records"]
bboxes = []
for receipt in receipts:
    west, south, east, north = map(float, urllib.parse.parse_qs(urllib.parse.urlparse(receipt["url"]).query)["bbox"][0].split(","))
    bboxes.append([west, south, east, north])
(SOURCE / "walking-road-overlay.json").write_text(json.dumps({
    "nodes": nodes,
    "ways": ways,
    "bboxes": bboxes,
    "sources": ["data-sources/iwakuni-yuu-directed-20260915/map-receipts.json"],
}, ensure_ascii=False) + "\n", encoding="utf-8")
print(json.dumps({"confirmed_walking_targets": len(confirmed), "held_points": len(held)}, ensure_ascii=False))
