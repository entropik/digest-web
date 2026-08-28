#!/usr/bin/env python3
"""Normalize and merge public links into a Hugo data file."""

from __future__ import annotations

import argparse
import ipaddress
import json
import re
import sys
import unicodedata
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit, urlunsplit

TRACKING_KEYS = {"_kx", "fbclid", "gclid", "mc_cid", "mc_eid", "nb_klid", "ref_src"}
PRIVATE_HOST_MARKERS = (".lan", ".local", ".internal")
SENSITIVE_QUERY_KEY = re.compile(
    r"(?:^|[_-])(auth|code|credential|jwt|key|pass(?:word)?|secret|session|signature|token)(?:$|[_-])",
    re.I,
)
SENSITIVE_PATH_SEGMENT = re.compile(
    r"/(?:[a-z0-9]+[._-])*(?:account|admin|auth|console|dashboard|invites?|invitations?|login|magic-link|oauth|password-reset|reset(?:-password)?|signin|verification|verify)(?:[._-][a-z0-9-]+)*(?:/|$)",
    re.I,
)
SENSITIVE_COMPACT_KEYS = {
    "accesstoken",
    "apikey",
    "authcode",
    "clientsecret",
    "code",
    "credential",
    "idtoken",
    "jwt",
    "key",
    "oauthcode",
    "password",
    "passwd",
    "refreshtoken",
    "secret",
    "session",
    "sessionid",
    "signature",
    "ticket",
    "token",
    "verificationtoken",
}
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


def stable_link_id(url: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, url))


def is_private_host(host: str) -> bool:
    if host == "localhost" or any(host.endswith(marker) for marker in PRIVATE_HOST_MARKERS):
        return True
    try:
        return ipaddress.ip_address(host).is_private
    except ValueError:
        return False


def is_sensitive_key(key: str) -> bool:
    separated = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", key)
    compact = re.sub(r"[^a-z0-9]", "", separated.lower())
    return bool(
        SENSITIVE_QUERY_KEY.search(separated)
        or compact in SENSITIVE_COMPACT_KEYS
        or re.fullmatch(r"tickets?(?:id|key|token)?", compact)
    )


def decode_url_component(value: str) -> str:
    decoded = value
    for _ in range(3):
        next_value = unquote(decoded)
        if next_value == decoded:
            break
        decoded = next_value
    return decoded


def canonicalize(raw_url: str, reject_sensitive: bool = False) -> str:
    parts = urlsplit(raw_url.strip())
    if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
        raise ValueError("only public HTTP(S) URLs are supported")
    if reject_sensitive and (parts.username or parts.password):
        raise ValueError("URL credentials are not publishable")

    host = parts.hostname.lower().rstrip(".")
    if reject_sensitive:
        host = host.encode("idna").decode("ascii")
    if is_private_host(host):
        raise ValueError("private or local host")
    if reject_sensitive:
        fragment = decode_url_component(parts.fragment)
        fragment_path_value, separator, fragment_query = fragment.partition("?")
        if not separator:
            fragment_query = fragment
        fragment_path = "/" + fragment_path_value.lstrip("/")
        if SENSITIVE_PATH_SEGMENT.search(
            decode_url_component(parts.path)
        ) or SENSITIVE_PATH_SEGMENT.search(fragment_path):
            raise ValueError("authenticated application page")
        if any(is_sensitive_key(key) for key, _ in parse_qsl(fragment_query, keep_blank_values=True)):
            raise ValueError("sensitive fragment parameter")

    port = parts.port
    netloc = host
    if port and not ((parts.scheme == "http" and port == 80) or (parts.scheme == "https" and port == 443)):
        netloc = f"{host}:{port}"

    query = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        lowered = key.lower()
        if reject_sensitive and is_sensitive_key(key):
            raise ValueError("sensitive query parameter")
        if lowered.startswith("utm_") or lowered in TRACKING_KEYS:
            continue
        query.append((key, value))

    path = re.sub(r"/{2,}", "/", parts.path or "/")
    if path != "/":
        path = path.rstrip("/")
    if reject_sensitive:
        from urllib.parse import quote

        path = quote(path, safe="/:@-._~!$&'()*+,;=%")
    fragment = "" if parts.fragment.lower() in {"fullscreen", "top"} else parts.fragment
    if reject_sensitive:
        from urllib.parse import quote

        fragment = quote(fragment, safe=":@-._~!$&'()*+,;=/?%")
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


def normalize_item(
    item: dict[str, object], fallback_date: str, reject_sensitive: bool = False
) -> dict[str, object]:
    url = canonicalize(str(item.get("url", "")), reject_sensitive=reject_sensitive)
    link_id = str(item.get("id", "")).strip() or stable_link_id(url)
    uuid.UUID(link_id)
    title = str(item.get("title", "")).strip() or infer_title(url)
    added = str(item.get("added", "")).strip() or fallback_date
    date.fromisoformat(added)
    category = str(item.get("category", "")).strip() or infer_category(title, url)
    normalized = {
        "title": title,
        "url": url,
        "category": category,
        "added": added,
        "id": link_id,
    }
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
        archive_url = str(item.get("archive_url", "")).strip()
        if archive_url:
            archive_parts = urlsplit(archive_url)
            if (
                archive_parts.scheme != "https"
                or archive_parts.hostname not in {"web.archive.org", "www.web.archive.org"}
                or archive_parts.username
                or archive_parts.password
            ):
                raise ValueError("archive_url must be a public HTTPS web.archive.org URL")
            archive_match = re.match(
                r"^/web/(\d{14})(?:[a-z_]+)?/(https?://.+)$",
                archive_parts.path,
                re.I,
            )
            if not archive_match:
                raise ValueError("archive_url must contain a timestamped Wayback replay")
            captured_url = canonicalize(archive_match.group(2))
            if urlsplit(captured_url).hostname != urlsplit(url).hostname:
                raise ValueError("archive_url must capture the original host")
            normalized["archive_url"] = archive_url

            archive_timestamp = str(item.get("archive_timestamp", "")).strip()
            if archive_timestamp and archive_timestamp != archive_match.group(1):
                raise ValueError("archive_timestamp must match archive_url")
            normalized["archive_timestamp"] = archive_timestamp or archive_match.group(1)

            archive_scope = str(item.get("archive_scope", "url")).strip().lower()
            if archive_scope not in {"url", "site"}:
                raise ValueError("archive_scope must be url or site")
            normalized["archive_scope"] = archive_scope
        archive_status = str(item.get("archive_status", "")).strip().lower()
        if archive_status:
            if archive_status != "missing" or archive_url:
                raise ValueError("archive_status is only supported as missing without archive_url")
            normalized["archive_status"] = archive_status
        archive_checked_at = str(item.get("archive_checked_at", "")).strip()
        if archive_checked_at:
            date.fromisoformat(archive_checked_at)
            normalized["archive_checked_at"] = archive_checked_at
        if archive_url and not archive_checked_at:
            raise ValueError("archive_url requires archive_checked_at")
        if archive_status and not archive_checked_at:
            raise ValueError("archive_status missing requires archive_checked_at")
    stream = str(item.get("stream", "")).strip().lower()
    if stream:
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", stream):
            raise ValueError(f"invalid stream slug: {stream}")
        normalized["stream"] = stream
    image = str(item.get("image", "")).strip()
    if image:
        if not image.startswith("/media/blog-ooblik/") or ".." in image:
            raise ValueError("image must be a local Blog OOBLIK media path")
        normalized["image"] = image
        normalized["image_alt"] = str(item.get("image_alt", "")).strip()
    elif item.get("image_alt"):
        raise ValueError("image_alt requires image")
    origin_url = str(item.get("origin_url", "")).strip()
    if origin_url:
        normalized["origin_url"] = canonicalize(
            origin_url, reject_sensitive=reject_sensitive
        )
    visibility = str(item.get("visibility", "")).strip().lower()
    if visibility:
        if visibility != "hidden":
            raise ValueError(f"unsupported visibility: {visibility}")
        hidden_at = str(item.get("hidden_at", "")).strip()
        if not hidden_at:
            raise ValueError("hidden links require hidden_at")
        try:
            datetime.fromisoformat(hidden_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("hidden_at must be an ISO timestamp") from exc
        normalized["visibility"] = visibility
        normalized["hidden_at"] = hidden_at
    return normalized


def validate(items: list[dict[str, object]]) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    seen_ids: set[str] = set()
    for index, item in enumerate(items, start=1):
        try:
            normalized = normalize_item(item, date.today().isoformat())
        except (ValueError, TypeError) as exc:
            errors.append(f"item {index}: {exc}")
            continue
        if normalized["url"] in seen:
            errors.append(f"item {index}: duplicate URL {normalized['url']}")
        if normalized["id"] in seen_ids:
            errors.append(f"item {index}: duplicate id {normalized['id']}")
        seen.add(normalized["url"])
        seen_ids.add(normalized["id"])
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
        if item.get("visibility") != "hidden"
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
            normalized = normalize_item(item, args.date, reject_sensitive=True)
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
