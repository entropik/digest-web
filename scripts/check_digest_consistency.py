#!/usr/bin/env python3
"""Validate that every dated link collection has a matching archive page."""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path


DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
FRONT_MATTER_PATTERN = re.compile(r"^---\s*$")
BLOG_MEDIA_PATTERN = re.compile(
    r"^/media/blog-ooblik/(?P<year>\d{4})/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.webp$"
)


def tag_slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(
        character for character in normalized if not unicodedata.combining(character)
    )
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()))


def tag_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(
        character for character in normalized if not unicodedata.combining(character)
    ).lower().strip()


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


def validate_blog_media(links: list[object], site: Path) -> list[str]:
    errors: list[str] = []
    static_root = (site / "static").resolve()
    media_root = static_root / "media" / "blog-ooblik"
    references: Counter[str] = Counter()

    for index, raw_link in enumerate(links, start=1):
        if not isinstance(raw_link, dict):
            continue
        link_id = str(raw_link.get("id", f"entrée-{index}"))
        image = raw_link.get("image")
        image_alt = raw_link.get("image_alt")
        if image_alt is not None and image is None:
            errors.append(f"média {link_id}: image_alt présent sans image")
        if image is None:
            continue
        path = str(image)
        if not BLOG_MEDIA_PATTERN.fullmatch(path) or "\\" in path or ".." in path:
            errors.append(f"média {link_id}: chemin non sûr ou non-WebP: {path!r}")
            continue
        destination = (static_root / path.lstrip("/")).resolve()
        try:
            destination.relative_to(static_root)
        except ValueError:
            errors.append(f"média {link_id}: chemin hors de static: {path!r}")
            continue
        references[path] += 1
        if not destination.is_file():
            errors.append(f"média {link_id}: fichier absent: {path}")

    for path, count in sorted(references.items()):
        if count != 1:
            errors.append(f"média référencé {count} fois: {path}")

    if media_root.is_dir():
        for media in sorted(media_root.rglob("*")):
            if not media.is_file():
                continue
            public_path = "/" + media.relative_to(static_root).as_posix()
            if media.suffix.lower() != ".webp":
                errors.append(f"média publié non-WebP: {public_path}")
            if references[public_path] == 0:
                errors.append(f"média orphelin: {public_path}")
    return errors


def validate(site: Path) -> list[str]:
    errors: list[str] = []
    links_path = site / "data" / "links.json"
    archives_dir = site / "content" / "archives"
    tags_dir = site / "content" / "tags"

    try:
        links = json.loads(links_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"{links_path}: impossible de lire les liens ({exc})"]

    if not isinstance(links, list):
        return [f"{links_path}: la racine JSON doit être une liste"]

    errors.extend(validate_blog_media(links, site))

    link_dates: Counter[str] = Counter()
    tag_usage: Counter[str] = Counter()
    tag_labels: dict[str, str] = {}
    for index, link in enumerate(links, start=1):
        if not isinstance(link, dict):
            errors.append(f"{links_path}: entrée {index} invalide")
            continue
        added = str(link.get("added", "")).strip()
        if not DATE_PATTERN.fullmatch(added):
            errors.append(f"{links_path}: entrée {index}, date added invalide: {added!r}")
            continue
        if str(link.get("visibility", "")).strip() != "hidden":
            raw_tags = link.get("tags", [])
            if not isinstance(raw_tags, list):
                errors.append(f"{links_path}: entrée {index}, tags invalides")
            else:
                for raw_tag in raw_tags:
                    tag = str(raw_tag).strip()
                    if tag:
                        key = tag_key(tag)
                        tag_usage[key] += 1
                        tag_labels.setdefault(key, tag)
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

    registered_tags: set[str] = set()
    for tag_path in tags_dir.glob("*.md"):
        if tag_path.name == "_index.md":
            continue
        try:
            params = parse_front_matter(tag_path)
            variants = json.loads(params.get("tags", "[]"))
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            errors.append(f"{tag_path}: taxonomie illisible ({exc})")
            continue
        if not isinstance(variants, list):
            errors.append(f"{tag_path}: tags doit être une liste")
            continue
        canonical = params.get("tag", "").strip()
        for variant in [canonical, *variants]:
            if str(variant).strip():
                registered_tags.add(tag_key(str(variant)))

    for missing_key in sorted(set(tag_usage) - registered_tags):
        label = tag_labels[missing_key]
        errors.append(
            f"tag sans destination: {label!r} (/tags/{tag_slug(label)}/, "
            f"{tag_usage[missing_key]} occurrence(s))"
        )

    if not errors:
        summary = ", ".join(
            f"{date}: {link_dates[date]} liens" for date in sorted(link_dates, reverse=True)
        )
        print(
            f"OK: {len(link_dates)} éditions et {len(tag_usage)} routes de tags "
            f"cohérentes — {summary}"
        )

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
