"""Validate and apply the GPT Chat facility decision manifest."""
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit
import argparse
import copy
import hashlib
import json


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data-sources" / "facility-backlog-review-20260920"
INPUT = SOURCE / "facility-backlog-input.json"
MANIFEST = SOURCE / "facility-decision-manifest.json"
DECISIONS = {"update", "no_change", "hold"}
ROOT_FIELDS = {"schema_version", "repository", "base_commit", "input_sha256", "summary", "decisions"}
DECISION_FIELDS = {
    "id",
    "decision",
    "current_record",
    "proposed_record",
    "official_evidence_urls",
    "confirmed_facts",
    "unresolved",
    "reason",
}
PROPOSED_FIELDS = {"name", "category", "geometry", "classification_review"}


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_manifest():
    return load_json(MANIFEST)


def _record_view(feature):
    properties = feature["properties"]
    return {
        "name": properties["name"],
        "category": properties["category"],
        "geometry": feature["geometry"],
        "classification_review": properties.get("classification_review"),
    }


def _safe_url(value):
    try:
        parsed = urlsplit(value)
        return parsed.scheme in ("https", "http") and bool(parsed.hostname) and not parsed.username and not parsed.password
    except (TypeError, ValueError):
        return False


def validate_manifest(data, manifest=None):
    manifest = manifest or load_manifest()
    source_input = load_json(INPUT)
    if set(manifest) != ROOT_FIELDS:
        raise ValueError("Unexpected manifest root fields")
    if manifest["schema_version"] != 1 or manifest["repository"] != "yyy-yuichi/bus-stop-compact-town":
        raise ValueError("Unexpected manifest identity")
    if manifest["base_commit"] != source_input["base_commit"]:
        raise ValueError("Manifest base commit does not match its input")
    # Git may check out JSON with CRLF on Windows; hash the canonical LF text
    # so the committed input fingerprint is portable across platforms.
    canonical_input = INPUT.read_bytes().replace(b'\r\n', b'\n')
    input_hash = hashlib.sha256(canonical_input).hexdigest()
    if manifest["input_sha256"] != input_hash:
        raise ValueError("Manifest input hash mismatch")

    input_candidates = {candidate["id"]: candidate for candidate in source_input["candidates"]}
    decisions = manifest["decisions"]
    decision_ids = [decision.get("id") for decision in decisions]
    if len(decision_ids) != 53 or len(set(decision_ids)) != 53 or set(decision_ids) != set(input_candidates):
        raise ValueError("Manifest must contain each of the 53 input IDs exactly once")
    counts = Counter(decision.get("decision") for decision in decisions)
    if set(counts) - DECISIONS or dict(counts) != manifest["summary"]["decision_counts"]:
        raise ValueError("Manifest decision counts do not match its summary")

    by_id = {feature["id"]: feature for feature in data["features"]}
    for decision in decisions:
        identifier = decision["id"]
        if set(decision) != DECISION_FIELDS:
            raise ValueError(f"Unexpected decision fields: {identifier}")
        candidate = input_candidates[identifier]
        expected_current = {
            "name": candidate["current_properties"]["name"],
            "category": candidate["current_properties"]["category"],
            "geometry": candidate["geometry"],
            "classification_review": candidate["current_properties"].get("classification_review"),
        }
        if decision["current_record"] != expected_current:
            raise ValueError(f"Manifest current record does not match its input: {identifier}")
        if identifier not in by_id:
            raise ValueError(f"Manifest ID is absent from generated facilities: {identifier}")
        current_view = _record_view(by_id[identifier])

        if decision["decision"] == "update":
            proposed = decision["proposed_record"]
            if not isinstance(proposed, dict) or set(proposed) != PROPOSED_FIELDS:
                raise ValueError(f"Invalid proposed record: {identifier}")
            if proposed["geometry"] != decision["current_record"]["geometry"]:
                raise ValueError(f"Coordinate or geometry change is not allowed: {identifier}")
            review = proposed["classification_review"]
            if proposed["category"] == "reference" and review.get("status") not in ("out_of_scope", "pending"):
                raise ValueError(f"Invalid reference review status: {identifier}")
            if current_view not in (decision["current_record"], proposed):
                raise ValueError(f"Generated record changed since the decision input: {identifier}")
        else:
            if decision["proposed_record"] is not None:
                raise ValueError(f"Non-update decision has a proposed record: {identifier}")
            if current_view != decision["current_record"]:
                raise ValueError(f"Held or unchanged record changed since the decision input: {identifier}")
            if decision["decision"] == "hold" and not decision["unresolved"]:
                raise ValueError(f"Hold decision has no evidence gap: {identifier}")

        if not decision["reason"] or any(not _safe_url(url) for url in decision["official_evidence_urls"]):
            raise ValueError(f"Invalid reason or evidence URL: {identifier}")
    return manifest


def apply_facility_decision_manifest(data, manifest=None):
    manifest = validate_manifest(data, manifest)
    updates = {decision["id"]: decision["proposed_record"] for decision in manifest["decisions"] if decision["decision"] == "update"}
    result = {**data, "features": [copy.deepcopy(feature) if feature["id"] in updates else feature for feature in data["features"]]}
    by_id = {feature["id"]: feature for feature in result["features"]}
    for identifier, proposed in updates.items():
        feature = by_id[identifier]
        feature["geometry"] = copy.deepcopy(proposed["geometry"])
        feature["properties"].update(
            name=proposed["name"],
            category=proposed["category"],
            classification_review=copy.deepcopy(proposed["classification_review"]),
        )
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=ROOT / "public" / "data" / "shopping.geojson", type=Path)
    args = parser.parse_args()
    data = load_json(args.data)
    manifest = validate_manifest(data)
    print(json.dumps({"decisions": dict(Counter(item["decision"] for item in manifest["decisions"])), "coordinate_changes": 0}, ensure_ascii=False))


if __name__ == "__main__":
    main()
