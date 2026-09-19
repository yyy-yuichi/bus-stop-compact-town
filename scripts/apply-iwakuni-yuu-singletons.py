"""Apply the audited hold reason to Yuu stops represented by one official point."""
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data-sources/iwakuni-yuu-singletons-20260915/classification.json"
STUDY_PATH = ROOT / "src/data/boarding-guide-study.json"

classification = json.loads(SOURCE.read_text(encoding="utf-8"))
study = json.loads(STUDY_PATH.read_text(encoding="utf-8"))
detail = {
    "同一公式点で道路側判定が方向により反転": "公式GTFSの同じ原点を対向方向の便が使用し、進行方向に対する道路側判定が反転します。方向別の別原点は公式資料にないため、位置を推測せず保留します。",
    "不整合のみで乗降側を確認できない": "公式停車順・shapeと道路線を照合しましたが、対象便では進行方向に対する乗降側の整合を確認できません。原点誤りとは断定せず保留します。",
    "曲折・分岐・起終点等で判定不能": "公式停車順・shapeと道路線を照合しましたが、曲折・分岐・起終点などにより進行方向に対する道路側を確定できません。",
}

for record in classification["records"]:
    guide = study["guides"][record["id"]]
    reason = detail[record["classification"]]
    assert guide["roadside_review"]["status"] == "hold"
    guide["location_description"] = "岩国市公式GTFSの原ID・原座標を表示しています。" + reason
    guide["roadside_review"] = {
        "status": "hold",
        "direction_status": "source-sequence-checked",
        "reason": reason,
        "walking_notice": "方向別の道路側を確認できないため、この原点の徒歩圏は未計算です。",
    }

assert len(classification["records"]) == 27
STUDY_PATH.write_text(json.dumps(study, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(classification["summary"], ensure_ascii=False))
