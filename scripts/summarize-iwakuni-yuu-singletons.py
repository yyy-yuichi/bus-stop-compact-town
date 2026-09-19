"""Summarize why Yuu stops represented by one official point stay uncomputed."""
from __future__ import annotations

from collections import Counter
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data-sources/iwakuni-yuu-singletons-20260915/ledger.json"
OUTPUT = ROOT / "data-sources/iwakuni-yuu-singletons-20260915/classification.json"

ledger = json.loads(SOURCE.read_text(encoding="utf-8"))
records = []
classes: Counter[str] = Counter()
for group in ledger["pairs"]:
    assert len(group["points"]) == 1
    point = group["points"][0]
    states = Counter(item["status"] for item in point["occurrences"])
    if states["整合"] and states["不整合"]:
        classification = "同一公式点で道路側判定が方向により反転"
    elif states["不整合"]:
        classification = "不整合のみで乗降側を確認できない"
    else:
        classification = "曲折・分岐・起終点等で判定不能"
    classes[classification] += 1
    records.append({
        "name": group["name"],
        "id": point["id"],
        "occurrences": len(point["occurrences"]),
        "states": dict(states),
        "classification": classification,
        "decision": "徒歩圏未計算。公式に別原点がないため方向別位置を推測しない。",
    })

assert len(records) == 27
assert sum(classes.values()) == 27
payload = {
    "scope": "由宇地区の追加65地点のうち、名称に対して公式原点が1点だけの27地点",
    "method": "公式GTFSの全停車順・shapeと取得時点のOpenStreetMap道路線による机上照合",
    "summary": {
        "points": len(records),
        "classifications": dict(classes),
        "walking_areas_added": 0,
        "walking_areas_held": len(records),
    },
    "records": records,
}
OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(payload["summary"], ensure_ascii=False))
