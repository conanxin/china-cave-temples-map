#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from typing import Any


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _validate_polygon(value: Any, field: str) -> None:
    if not isinstance(value, dict) or value.get("type") != "Polygon":
        raise ValueError(f"{field} must be a Polygon")
    coordinates = value.get("coordinates")
    if not isinstance(coordinates, list) or not coordinates or not isinstance(coordinates[0], list) or len(coordinates[0]) < 4:
        raise ValueError(f"{field} polygon ring is invalid")


def validate_approved_patch(patch: Any) -> None:
    if not isinstance(patch, dict) or patch.get("schemaVersion") != 1:
        raise ValueError("unsupported patch schemaVersion")
    if patch.get("reviewStatus") != "human-approved":
        raise ValueError("patch must be human-approved")
    for key in ("patchId", "siteCode", "extentId", "sourceSessionId"):
        if not isinstance(patch.get(key), str) or not patch[key].strip():
            raise ValueError(f"patch {key} is required")
    if not isinstance(patch.get("siteId"), int) or patch["siteId"] <= 0:
        raise ValueError("patch siteId is invalid")
    confirmation = patch.get("confirmation")
    expected_token = f"APPROVE {patch['siteCode']} {patch['extentId']}"
    if not isinstance(confirmation, dict) or confirmation.get("token") != expected_token or not confirmation.get("confirmedAt"):
        raise ValueError("patch confirmation is invalid")
    qa = patch.get("qa")
    if not isinstance(qa, dict) or qa.get("readiness") != "strong":
        raise ValueError("patch QA readiness must be strong")
    _validate_polygon(patch.get("geometryWgs84"), "geometryWgs84")
    _validate_polygon(patch.get("geometryGcj02"), "geometryGcj02")


def apply_patch_file(patch_path: Path, registry_path: Path, *, replace: bool = False) -> dict[str, Any]:
    patch = _load_json(patch_path)
    validate_approved_patch(patch)
    registry = _load_json(registry_path) if registry_path.exists() else []
    if not isinstance(registry, list):
        raise ValueError("registry must be a JSON array")
    index = next((i for i, item in enumerate(registry) if item.get("siteId") == patch["siteId"] and item.get("extentId") == patch["extentId"]), None)
    if index is not None and not replace:
        raise ValueError(f"registry already contains site {patch['siteId']} extent {patch['extentId']}")
    if index is None:
        registry.append(patch)
        action = "applied"
    else:
        registry[index] = patch
        action = "replaced"
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"status": action, "patchId": patch["patchId"], "registry": str(registry_path)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply a human-approved georeference extent patch to the canonical reviewed patch registry.")
    parser.add_argument("patch", type=Path)
    parser.add_argument("--registry", type=Path, default=Path("src/data/reviewedExtentPatches.json"))
    parser.add_argument("--replace", action="store_true", help="Replace an existing patch for the same site+extent.")
    args = parser.parse_args()
    result = apply_patch_file(args.patch, args.registry, replace=args.replace)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
