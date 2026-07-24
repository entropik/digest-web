#!/usr/bin/env python3
"""Normalize and merge public links into a Hugo data file."""

from __future__ import annotations

import argparse
import ipaddress
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

TRACKING_KEYS = {"_kx", "fbclid", "gclid", "mc_cid", "mc_eid", "nb_klid", "ref_src"}
PRIVATE_HOST_MARKERS = (".lan", ".local", ".internal")
MARKDOWN_LINK = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)")
BARE_URL = re.compile(r"(?<!\()(https?://[^\s<>\]]+)")
MARKDOWN_ENTRY = re.compile(r"^### \[([^\]]+)\]\((https?://[^)]+)\)\s*$")
MARKDOWN_SECTION = re.compile(r"^## (.+?)\s*$")
MARKDOWN_TAGS = re.compile(r"`#([^`]+)`")
SECTION_CATEGORIES = {
    "Intelligence artificielle et agents": "IA & Agents",
    "Développement et outillage": "Développement",
    "Design, interfaces et création": "Design & Création",
    "Médias, société et veille": "Médias & Veille",
}


def is_private_host(host: str) -> bool:
    if host == "localhost" or any(host.endswith(marker) for marker in PRIVATE_HOST_MARKERS):
        return True
    try:
        return ipaddress.ip_address(host).is_private
    except ValueError:
        return False


def canonicalize(raw_url: str) -> str:
    parts = urlsplit(raw_url.strip())
    if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
        raise ValueError("only public HTTP(S) URLs are supported")

    host = parts.hostname.lower().rstrip(".")
    if is_private_host(host):
        raise ValueError("private or local host")

    port = parts.port
    netloc = host
    if port and not ((parts.scheme == "http" and port == 80) or (parts.scheme == "https" and port == 443)):
        netloc = f"{host}:{port}"

    query = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        lowered = key.lower()
        if lowered.startswith("utm_") or lowered in TRACKING_KEYS:
            continue
        query.append((key, value))

    path = re.sub(r"/{2,}", "/", parts.path or "/")
    if path != "/":
        path = path.rstrip("/")
    fragment = "" if parts.fragment.lower() in {"fullscreen", "top"} else parts.fragment
    return urlunsplit((parts.scheme.lower(), netloc, path, urlencode(query, doseq=True), fragment))


def infer_title(url: str) -> str:
    parts = urlsplit(url)
    segments = [segment for segment in parts.path.split("/") if segment]
    if parts.hostname in {"github.com", "www.github.com"} and len(segments) >= 2:
        return f"{segments[0]}/{segments[1]}"
    if segments:
        return segments[-1].replace("-", " ").replace("_", " ").strip().title()
    return (parts.hostname or url).removeprefix("www.")


def infer_category(title: str, url: str) -> str:
    text = f"{title} {url}".lower()
    rules = [
        ("Sécurité", r"security|pentest|cyber|hack|medusa"),
        ("Photo & Print", r"photo|image|raw|print|pdf|zine|brush"),
        ("Design", r"design|penpot|editor|layout|typograph"),
        ("Auto-hébergement", r"self.host|jellyfin|seerr|plakar|localsend|synology"),
        ("IA & Agents", r"\bai\b|\bia\b|llm|agent|codex|claude|model|token|rag"),
    ]
    for category, pattern in rules:
        if re.search(pattern, text):
            return category
    return "Développement"


def load_input(path: Path, fallback_date: str) -> list[dict[str, object]]:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        payload = json.loads(text)
        if isinstance(payload, dict):
            payload = payload.get("links", [])
        if not isinstance(payload, list):
            raise ValueError("JSON input must be an array or an object with a links array")
        return [dict(item) for item in payload]

    lines = text.splitlines()
    rich_entries: list[dict[str, object]] = []
    current_category = ""
    index = 0
    while index < len(lines):
        section = MARKDOWN_SECTION.match(lines[index])
        if section:
            current_category = SECTION_CATEGORIES.get(section.group(1), section.group(1))
            index += 1
            continue

        entry_match = MARKDOWN_ENTRY.match(lines[index])
        if not entry_match:
            index += 1
            continue

        item: dict[str, object] = {
            "title": entry_match.group(1).strip(),
            "url": entry_match.group(2),
            "added": fallback_date,
        }
        if current_category:
            item["category"] = current_category

        index += 1
        description_lines: list[str] = []
        tags: list[str] = []
        while index < len(lines) and not lines[index].startswith(("## ", "### ")):
            stripped = lines[index].strip()
            if stripped.startswith("**Tags"):
                tags = MARKDOWN_TAGS.findall(stripped)
            elif stripped and not stripped.startswith(">"):
                description_lines.append(stripped)
            index += 1

        if description_lines:
            item["description"] = " ".join(description_lines)
        if tags:
            item["tags"] = tags
        rich_entries.append(item)

    if rich_entries:
        return rich_entries

    found: list[dict[str, object]] = []
    occupied: set[str] = set()
    for match in MARKDOWN_LINK.finditer(text):
        found.append({"title": match.group(1).strip(), "url": match.group(2), "added": fallback_date})
        occupied.add(match.group(2))
    for match in BARE_URL.finditer(text):
        if match.group(1) not in occupied:
            found.append({"url": match.group(1).rstrip(".,;"), "added": fallback_date})
    return found


def normalize_item(item: dict[str, object], fallback_date: str) -> dict[str, object]:
    url = canonicalize(str(item.get("url", "")))
    title = str(item.get("title", "")).strip() or infer_title(url)
    added = str(item.get("added", "")).strip() or fallback_date
    date.fromisoformat(added)
    category = str(item.get("category", "")).strip() or infer_category(title, url)
    normalized = {"title": title, "url": url, "category": category, "added": added}
    description = str(item.get("description", "")).strip()
    if description:
        normalized["description"] = description
    tags = item.get("tags", [])
    if isinstance(tags, list):
        clean_tags = [str(tag).strip().lstrip("#") for tag in tags if str(tag).strip()]
        if clean_tags:
            normalized["tags"] = clean_tags
    status = str(item.get("status", "")).strip().lower()
    if status:
        if status not in {"dead"}:
            raise ValueError(f"unsupported link status: {status}")
        normalized["status"] = status
        status_note = str(item.get("status_note", "")).strip()
        if status_note:
            normalized["status_note"] = status_note
    stream = str(item.get("stream", "")).strip().lower()
    if stream:
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", stream):
            raise ValueError(f"invalid stream slug: {stream}")
        normalized["stream"] = stream
    return normalized


def validate(items: list[dict[str, object]]) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    for index, item in enumerate(items, start=1):
        try:
            normalized = normalize_item(item, date.today().isoformat())
        except (ValueError, TypeError) as exc:
            errors.append(f"item {index}: {exc}")
            continue
        if normalized["url"] in seen:
            errors.append(f"item {index}: duplicate URL {normalized['url']}")
        seen.add(normalized["url"])
    return errors


def slugify_tag(tag: str) -> str:
    ascii_tag = (
        unicodedata.normalize("NFKD", tag)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )
    return re.sub(r"[^a-z0-9]+", "-", ascii_tag).strip("-")


def write_tag_pages(site: Path, items: list[dict[str, object]], dry_run: bool) -> int:
    tag_counts: Counter[str] = Counter(
        str(tag).strip().lstrip("#")
        for item in items
        for tag in item.get("tags", [])
        if str(tag).strip()
    )
    tags_by_slug: defaultdict[str, list[str]] = defaultdict(list)
    for tag in tag_counts:
        tags_by_slug[slugify_tag(tag)].append(tag)
    if dry_run:
        return len(tags_by_slug)

    tag_directory = site / "content" / "tags"
    tag_directory.mkdir(parents=True, exist_ok=True)
    (tag_directory / "_index.md").write_text(
        '---\ntitle: "Tags"\ndescription: "Toutes les ressources classées par tag."\n---\n',
        encoding="utf-8",
    )
    for slug, variants in sorted(tags_by_slug.items()):
        variants.sort(key=lambda tag: (-tag_counts[tag], tag.casefold(), tag))
        tag = variants[0]
        front_matter = (
            "---\n"
            f"title: {json.dumps('#' + tag, ensure_ascii=False)}\n"
            f"tag: {json.dumps(tag, ensure_ascii=False)}\n"
            f"tags: {json.dumps(variants, ensure_ascii=False)}\n"
            'generated_by: "curate-web-digest"\n'
            "---\n"
        )
        (tag_directory / f"{slug}.md").write_text(front_matter, encoding="utf-8")
    return len(tags_by_slug)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", type=Path, help="JSON or Markdown file to import")
    parser.add_argument("--site", type=Path, default=Path.cwd(), help="Hugo project directory")
    parser.add_argument("--date", default=date.today().isoformat(), help="fallback ISO addition date")
    parser.add_argument("--replace", action="store_true", help="replace instead of merge")
    parser.add_argument("--dry-run", action="store_true", help="report without writing")
    parser.add_argument("--check", action="store_true", help="validate the current data file")
    parser.add_argument(
        "--tag-pages",
        action="store_true",
        help="generate one Hugo archive page per unique tag",
    )
    args = parser.parse_args()

    target = args.site.resolve() / "data" / "links.json"
    existing = json.loads(target.read_text(encoding="utf-8")) if target.exists() else []

    if args.check:
        errors = validate(existing)
        if errors:
            print("\n".join(errors), file=sys.stderr)
            return 1
        print(f"OK: {len(existing)} unique public links in {target}")
        return 0

    if not args.input:
        parser.error("input is required unless --check is used")

    incoming = load_input(args.input, args.date)
    result: dict[str, dict[str, object]] = {}
    skipped: list[str] = []
    duplicates = 0

    if not args.replace:
        for item in existing:
            normalized = normalize_item(item, args.date)
            result[normalized["url"]] = normalized

    for item in incoming:
        try:
            normalized = normalize_item(item, args.date)
        except (ValueError, TypeError) as exc:
            skipped.append(f"{item.get('url', '<missing URL>')}: {exc}")
            continue
        if normalized["url"] in result:
            duplicates += 1
            continue
        result[normalized["url"]] = normalized

    output = sorted(
        result.values(),
        key=lambda item: (item["added"], item["title"].casefold()),
        reverse=True,
    )
    accepted = len(incoming) - len(skipped) - duplicates
    print(
        f"input={len(incoming)} accepted={accepted} duplicates={duplicates} "
        f"skipped={len(skipped)} total={len(output)}"
    )
    for warning in skipped:
        print(f"SKIP: {warning}", file=sys.stderr)

    if not args.dry_run:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {target}")
    if args.tag_pages:
        tag_count = write_tag_pages(args.site.resolve(), output, args.dry_run)
        print(f"{'Would generate' if args.dry_run else 'Generated'} {tag_count} tag pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
