#!/usr/bin/env python3
"""Check candidate URL normalization against the cross-runtime fixtures."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "skills" / "curate-web-digest" / "scripts" / "curate_links.py"
SPEC = importlib.util.spec_from_file_location("curate_links", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

fixtures = json.loads(
    (ROOT / "test-fixtures" / "url-canonicalization.json").read_text(encoding="utf-8")
)
errors: list[str] = []
for fixture in fixtures:
    try:
        actual = MODULE.canonicalize(fixture["input"], reject_sensitive=True)
        if fixture.get("error"):
            errors.append(f"{fixture['name']}: expected an error, got {actual}")
        elif actual != fixture["expected"]:
            errors.append(
                f"{fixture['name']}: expected {fixture['expected']}, got {actual}"
            )
    except ValueError:
        if not fixture.get("error"):
            errors.append(f"{fixture['name']}: unexpected validation error")

if errors:
    raise SystemExit("\n".join(errors))
print(f"OK: {len(fixtures)} shared URL canonicalization fixtures")
