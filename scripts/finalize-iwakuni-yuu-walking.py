"""Record walking outcomes for the confirmed Yuu points without moving origins."""
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data-sources/iwakuni-yuu-directed-20260915"
STUDY_PATH = ROOT / "src/data/boarding-guide-study.json"
INDEX_PATH = ROOT / "src/data/boarding-walk-study/index.json"

study = json.loads(STUDY_PATH.read_text(encoding="utf-8"))
index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))["stops"]
targets = json.loads((SOURCE / "walking-target-ids.json").read_text(encoding="utf-8"))
calculated = []
uncomputed = []
for stop_id in targets:
    entry = index[stop_id]
    guide = study["guides"][stop_id]
    if entry.get("file"):
        guide["data_notice"] = "方面は2026年3月27日改正の岩国市公式GTFSによります。徒歩圏は原座標から道路接続を確認して計算しています。"
        calculated.append(stop_id)
    else:
        guide["data_notice"] = "方面と道路側は机上確認済みです。歩行可能道路が30m以内にないため徒歩圏は未計算です。"
        guide["roadside_review"]["walking_notice"] = "道路側は机上確認済みですが、原座標から30m以内に歩行可能道路がないため徒歩圏は未計算です。"
        uncomputed.append({"id": stop_id, "gap_m": entry.get("gap")})

assert len(calculated) == 13 and len(uncomputed) == 6
STUDY_PATH.write_text(json.dumps(study, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(SOURCE / "walking-result.json").write_text(json.dumps({
    "confirmed_targets": len(targets),
    "calculated": calculated,
    "calculated_count": len(calculated),
    "uncomputed": uncomputed,
    "uncomputed_count": len(uncomputed),
    "existing_calculations_recomputed": 0,
    "field_checked": False,
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"calculated": len(calculated), "uncomputed": len(uncomputed)}, ensure_ascii=False))
