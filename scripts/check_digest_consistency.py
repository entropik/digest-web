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


import yaml

DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ARCHIVE_FILENAME_PATTERN = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:-([a-z0-9-]+))?$")
FRONT_MATTER_PATTERN = re.compile(r"^---\s*$")
BLOG_MEDIA_PATTERN = re.compile(
    r"^/media/blog-ooblik/(?P<year>\d{4})/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.webp$"
)
HISTORICAL_UNSLUGGED_FOCUS = frozenset(
    {"2026-08-28", "2026-08-29", "2026-09-02", "2026-09-09"}
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


def parse_front_matter(path: Path) -> dict[str, object]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        raise ValueError("front matter YAML manquant")
    parts = text.split("---", 2)
    if len(parts) < 3:
        raise ValueError("front matter YAML non fermé")
    try:
        data = yaml.safe_load(parts[1])
    except yaml.YAMLError as exc:
        raise ValueError(f"erreur YAML dans front matter: {exc}") from exc
    if not isinstance(data, dict):
        return {}
    return data


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
    visible_link_dates: Counter[str] = Counter()
    tag_usage: Counter[str] = Counter()
    tag_labels: dict[str, str] = {}
    public_catalog_urls: set[str] = set()
    for index, link in enumerate(links, start=1):
        if not isinstance(link, dict):
            errors.append(f"{links_path}: entrée {index} invalide")
            continue
        added = str(link.get("added", "")).strip()
        if not DATE_PATTERN.fullmatch(added):
            errors.append(f"{links_path}: entrée {index}, date added invalide: {added!r}")
            continue
        visibility = str(link.get("visibility", "")).strip()
        visibility_reason = str(link.get("visibility_reason", "")).strip()
        if visibility not in ("", "hidden"):
            errors.append(
                f"{links_path}: entrée {index}, visibility invalide: {visibility!r}"
            )
        if visibility_reason not in ("", "editorial", "edition-draft"):
            errors.append(
                f"{links_path}: entrée {index}, visibility_reason invalide: "
                f"{visibility_reason!r}"
            )
        if visibility != "hidden" and visibility_reason:
            errors.append(
                f"{links_path}: entrée {index}, visibility_reason exige visibility=hidden"
            )
        if visibility != "hidden":
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
        if visibility != "hidden":
            visible_link_dates[added] += 1
            raw_url = str(link.get("url", "")).strip()
            if raw_url:
                public_catalog_urls.add(raw_url)

    archive_dates: set[str] = set()
    primary_archive_dates: set[str] = set()
    focus_dates: set[str] = set()
    archive_drafts: dict[str, bool] = {}
    seen_archive_images: dict[str, Path] = {}

    for archive_path in sorted(archives_dir.glob("*.md")):
        if archive_path.name in ("_index.md", "_index.en.md"):
            continue

        match = ARCHIVE_FILENAME_PATTERN.fullmatch(archive_path.stem)
        if not match:
            errors.append(
                f"{archive_path}: le nom doit respecter content/archives/YYYY-MM-DD.md "
                f"ou content/archives/YYYY-MM-DD-<slug>.md"
            )
            continue

        file_date = match.group(1)
        file_slug = match.group(2)

        try:
            params = parse_front_matter(archive_path)
        except (OSError, ValueError) as exc:
            errors.append(f"{archive_path}: {exc}")
            continue

        digest_date = str(params.get("digest_date", "")).strip()
        if digest_date != file_date:
            errors.append(
                f"{archive_path}: digest_date={digest_date!r}, attendu {file_date!r}"
            )
        if not params.get("title"):
            errors.append(f"{archive_path}: title manquant")

        editorial_type = str(params.get("editorial_type", "digest")).strip()
        is_focus = editorial_type == "focus"
        if is_focus or file_slug:
            focus_dates.add(file_date)
        else:
            primary_archive_dates.add(file_date)
            archive_drafts[file_date] = str(params.get("draft", "")).lower() == "true"

        archive_dates.add(file_date)
        if file_date not in archive_drafts:
            archive_drafts[file_date] = str(params.get("draft", "")).lower() == "true"

        # Vérification des visuels sociaux pour chaque archive
        stem = archive_path.stem
        social_landscape = site / "static" / "social" / f"{stem}.png"
        social_square = site / "static" / "social" / f"{stem}-linkedin.png"
        if not social_landscape.is_file():
            errors.append(
                f"{archive_path}: visuel social manquant static/social/{stem}.png"
            )
        if not social_square.is_file():
            errors.append(
                f"{archive_path}: visuel social LinkedIn manquant static/social/{stem}-linkedin.png"
            )

        # Vérification de l'unicité et de la présence de l'archive_image pour les Focus
        archive_image = params.get("archive_image")
        if is_focus or archive_image is not None:
            if not archive_image:
                errors.append(f"{archive_path}: archive_image manquant pour le billet Focus")
            else:
                image_str = str(archive_image).strip()
                if image_str in seen_archive_images:
                    errors.append(
                        f"{archive_path}: archive_image {image_str!r} déjà utilisé dans "
                        f"{seen_archive_images[image_str].name}"
                    )
                else:
                    seen_archive_images[image_str] = archive_path

                image_file = (site / "static" / image_str.lstrip("/")).resolve()
                if not image_file.is_file():
                    errors.append(
                        f"{archive_path}: fichier archive_image introuvable dans static: {image_str}"
                    )

        # Vérification des règles de nommage Focus
        if is_focus:
            if not file_slug and file_date not in HISTORICAL_UNSLUGGED_FOCUS:
                errors.append(
                    f"{archive_path}: tout nouveau billet Focus doit comporter un slug "
                    f"dans son nom de fichier (content/archives/{file_date}-<slug>.md)"
                )
            if (
                not file_slug
                and file_date not in HISTORICAL_UNSLUGGED_FOCUS
                and visible_link_dates[file_date] > 0
            ):
                errors.append(
                    f"{archive_path}: un billet Focus ne peut pas écraser le Digest quotidien "
                    f"du même jour ({visible_link_dates[file_date]} liens publics)"
                )

        # Vérification de link_urls
        raw_link_urls = params.get("link_urls")
        if raw_link_urls is not None:
            if not isinstance(raw_link_urls, list):
                errors.append(f"{archive_path}: link_urls doit être une liste")
            else:
                seen_urls: set[str] = set()
                for raw_url in raw_link_urls:
                    url = str(raw_url).strip()
                    if not url:
                        continue
                    if url in seen_urls:
                        errors.append(f"{archive_path}: URL dupliquée dans link_urls: {url}")
                    seen_urls.add(url)
                    if url not in public_catalog_urls:
                        errors.append(
                            f"{archive_path}: URL {url!r} listée dans link_urls est "
                            f"introuvable dans le catalogue public data/links.json"
                        )

    # Vérification qu'aucun Focus n'écrase un Digest quotidien
    for date, count in sorted(visible_link_dates.items()):
        if count > 0:
            daily_archive = archives_dir / f"{date}.md"
            if not daily_archive.is_file():
                errors.append(
                    f"Digest quotidien manquant: content/archives/{date}.md ({count} liens publics)"
                )
            elif date not in HISTORICAL_UNSLUGGED_FOCUS:
                try:
                    daily_params = parse_front_matter(daily_archive)
                    if str(daily_params.get("editorial_type", "digest")).strip() == "focus":
                        errors.append(
                            f"content/archives/{date}.md: ce fichier remplace indûment le Digest "
                            f"quotidien par un Focus ({count} liens publics perdus)"
                        )
                except Exception:
                    pass

    for missing_date in sorted(set(link_dates) - archive_dates):
        errors.append(
            f"édition manquante: content/archives/{missing_date}.md "
            f"({link_dates[missing_date]} liens)"
        )

    for orphan_date in sorted(primary_archive_dates - set(link_dates) - focus_dates):
        errors.append(
            f"édition orpheline: content/archives/{orphan_date}.md ne possède aucun lien"
        )

    for date in sorted(primary_archive_dates & set(link_dates)):
        markdown_is_draft = archive_drafts[date]
        catalog_is_draft = visible_link_dates[date] == 0
        if markdown_is_draft != catalog_is_draft:
            errors.append(
                f"édition incohérente {date}: draft={str(markdown_is_draft).lower()} "
                f"mais {visible_link_dates[date]} lien(s) public(s) dans data/links.json"
            )

    registered_tags: set[str] = set()
    for tag_path in tags_dir.glob("*.md"):
        if tag_path.name == "_index.md":
            continue
        try:
            params = parse_front_matter(tag_path)
            raw_variants = params.get("tags", [])
            if isinstance(raw_variants, str):
                variants = json.loads(raw_variants)
            elif isinstance(raw_variants, list):
                variants = raw_variants
            else:
                variants = []
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
