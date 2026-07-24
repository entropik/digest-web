#!/usr/bin/env python3
"""Prepare quarantined Pinboard social links as historical source streams."""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from prepare_pinboard_archive import (
    apply_probe_results,
    clean_title,
    host_label,
)


STREAM_BY_HOST = {
    "twitter.com": "twitter",
    "instagram.com": "instagram",
    "www.instagram.com": "instagram",
    "ooblik.tumblr.com": "tumblr-ooblik",
    "blog.ooblik.com": "blog-ooblik",
}
STREAM_TAG = {
    "twitter": "twitter",
    "instagram": "instagram",
    "tumblr-ooblik": "tumblr",
    "blog-ooblik": "blog-ooblik",
}


def load_social_items(root: Path) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for path in sorted((root / "review" / "social-personal").rglob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise ValueError(f"{path}: une liste JSON était attendue")
        items.extend(dict(item) for item in payload)
    return items


def curate_social_item(item: dict[str, object]) -> dict[str, object]:
    url = str(item["url"]).strip()
    host = (urlsplit(url).hostname or "").lower()
    stream = STREAM_BY_HOST.get(host)
    if not stream:
        raise ValueError(f"source sociale inconnue: {host}")

    title, error_code = clean_title(str(item.get("title", "")), url)
    description = html.unescape(str(item.get("description", ""))).strip()
    if not description:
        description = (
            f"Publication historique du flux {STREAM_TAG[stream]}, enregistrée "
            f"depuis {host_label(url)} dans l’archive Pinboard."
        )

    tags: list[str] = []
    for raw_tag in item.get("tags", []):
        tag = str(raw_tag).strip().lstrip("#")
        if tag and tag.casefold() not in {current.casefold() for current in tags}:
            tags.append(tag)
    for tag in (STREAM_TAG[stream], "mémoire-web"):
        if tag.casefold() not in {current.casefold() for current in tags}:
            tags.append(tag)

    curated: dict[str, object] = {
        "title": re.sub(r"\s+", " ", title),
        "url": url,
        "category": "Mémoire du web social",
        "added": str(item["added"]),
        "description": re.sub(r"\s+", " ", description),
        "tags": tags[:12],
        "stream": stream,
    }
    if error_code and error_code >= 400:
        curated["status"] = "dead"
        curated["status_note"] = (
            f"La publication était signalée en erreur HTTP {error_code} dans "
            "l’export Pinboard. Son adresse historique est conservée pour mémoire."
        )
        if "lien-mort" not in tags:
            tags.append("lien-mort")
        curated["tags"] = tags[:12]
    return curated


def prepare(root: Path, output: Path, probe_path: Path | None) -> dict[str, object]:
    raw_items = load_social_items(root)
    curated = [curate_social_item(item) for item in raw_items]
    curated, probe_stats = apply_probe_results(curated, probe_path)

    unique: dict[str, dict[str, object]] = {}
    duplicates = 0
    for item in curated:
        url = str(item["url"])
        if url in unique:
            duplicates += 1
            continue
        unique[url] = item
    output_items = sorted(
        unique.values(),
        key=lambda item: (str(item["added"]), str(item["title"]).casefold()),
        reverse=True,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(output_items, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    stream_counts: dict[str, int] = {}
    for stream in sorted(set(STREAM_BY_HOST.values())):
        stream_counts[stream] = sum(item["stream"] == stream for item in output_items)
    return {
        "raw": len(raw_items),
        "curated": len(output_items),
        "duplicates": duplicates,
        "dead": sum(item.get("status") == "dead" for item in output_items),
        "dates": len({str(item["added"]) for item in output_items}),
        "streams": stream_counts,
        **probe_stats,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path("import/pinboard"),
        help="Dossier de travail Pinboard.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("import/pinboard/curated/all-social.json"),
        help="JSON social curaté à produire.",
    )
    parser.add_argument(
        "--probe-results",
        type=Path,
        default=Path("import/pinboard/social-probe-results.json"),
        help="Résultats facultatifs de probe_public_links.mjs.",
    )
    args = parser.parse_args()
    print(
        json.dumps(
            prepare(
                args.root.resolve(),
                args.output.resolve(),
                args.probe_results.resolve(),
            ),
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
