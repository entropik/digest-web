#!/usr/bin/env python3
"""Add stable UUIDv5 identifiers to Digest links that do not have one."""

from __future__ import annotations

import argparse
import json
import uuid
from pathlib import Path


def stable_link_id(url: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, url))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data",
        type=Path,
        default=Path("data/links.json"),
        help="Digest JSON data file",
    )
    parser.add_argument("--check", action="store_true", help="validate without writing")
    args = parser.parse_args()

    data_path = args.data.resolve()
    links = json.loads(data_path.read_text(encoding="utf-8"))
    if not isinstance(links, list):
        raise SystemExit(f"{data_path}: expected a JSON array")

    changed = 0
    seen: set[str] = set()
    for index, link in enumerate(links, start=1):
        if not isinstance(link, dict):
            raise SystemExit(f"{data_path}: item {index} is not an object")
        link_id = str(link.get("id", "")).strip()
        if not link_id:
            link_id = stable_link_id(str(link.get("url", "")).strip())
            link["id"] = link_id
            changed += 1
        try:
            uuid.UUID(link_id)
        except ValueError as exc:
            raise SystemExit(f"{data_path}: item {index} has invalid id {link_id!r}") from exc
        if link_id in seen:
            raise SystemExit(f"{data_path}: duplicate id {link_id}")
        seen.add(link_id)

    if args.check:
        if changed:
            raise SystemExit(f"{data_path}: {changed} links do not have an id")
        print(f"OK: {len(links)} stable link ids in {data_path}")
        return 0

    if changed:
        data_path.write_text(
            json.dumps(links, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    print(f"{'Added' if changed else 'Found'} {changed or len(links)} link ids in {data_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
