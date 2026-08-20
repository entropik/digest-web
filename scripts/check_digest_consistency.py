#!/usr/bin/env python3
"""Validate that every dated link collection has a matching archive page."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path


DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
FRONT_MATTER_PATTERN = re.compile(r"^---\s*$")


def parse_front_matter(path: Path) -> dict[str, str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or not FRONT_MATTER_PATTERN.match(lines[0]):
        raise ValueError("front matter YAML manquant")

    values: dict[str, str] = {}
    for line in lines[1:]:
        if FRONT_MATTER_PATTERN.match(line):
            return values
        if ":" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split(":", 1)
        values[key.strip()] = value.strip().strip("\"'")

    raise ValueError("front matter YAML non fermé")


def validate(site: Path) -> list[str]:
    errors: list[str] = []
    links_path = site / "data" / "links.json"
    archives_dir = site / "content" / "archives"

    try:
        links = json.loads(links_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"{links_path}: impossible de lire les liens ({exc})"]

    if not isinstance(links, list):
        return [f"{links_path}: la racine JSON doit être une liste"]

    link_dates: Counter[str] = Counter()
    for index, link in enumerate(links, start=1):
        if not isinstance(link, dict):
            errors.append(f"{links_path}: entrée {index} invalide")
            continue
        added = str(link.get("added", "")).strip()
        if not DATE_PATTERN.fullmatch(added):
            errors.append(f"{links_path}: entrée {index}, date added invalide: {added!r}")
            continue
        if (
            str(link.get("stream", "")).strip() == "blog-ooblik"
            and str(link.get("origin_url", "")).strip()
        ):
            continue
        link_dates[added] += 1

    archive_dates: set[str] = set()
    for archive_path in sorted(archives_dir.glob("*.md")):
        if archive_path.name == "_index.md":
            continue

        filename_date = archive_path.stem
        if not DATE_PATTERN.fullmatch(filename_date):
            errors.append(
                f"{archive_path}: le nom doit respecter content/archives/YYYY-MM-DD.md"
            )
            continue

        try:
            params = parse_front_matter(archive_path)
        except (OSError, ValueError) as exc:
            errors.append(f"{archive_path}: {exc}")
            continue

        digest_date = params.get("digest_date", "")
        if digest_date != filename_date:
            errors.append(
                f"{archive_path}: digest_date={digest_date!r}, attendu {filename_date!r}"
            )
        if not params.get("title"):
            errors.append(f"{archive_path}: title manquant")
        archive_dates.add(filename_date)

    for missing_date in sorted(set(link_dates) - archive_dates):
        errors.append(
            f"édition manquante: content/archives/{missing_date}.md "
            f"({link_dates[missing_date]} liens)"
        )

    for orphan_date in sorted(archive_dates - set(link_dates)):
        errors.append(
            f"édition orpheline: content/archives/{orphan_date}.md ne possède aucun lien"
        )

    if not errors:
        summary = ", ".join(
            f"{date}: {link_dates[date]} liens" for date in sorted(link_dates, reverse=True)
        )
        print(f"OK: {len(link_dates)} éditions cohérentes — {summary}")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--site",
        type=Path,
        default=Path.cwd(),
        help="Racine du projet Hugo (défaut: dossier courant)",
    )
    args = parser.parse_args()

    errors = validate(args.site.resolve())
    if errors:
        print("ERREUR: incohérences entre les liens et les archives:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
