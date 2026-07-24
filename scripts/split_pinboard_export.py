#!/usr/bin/env python3
"""Convert a Pinboard JSON export into reviewable Digest import batches."""

from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import re
import shutil
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


TRACKING_KEYS = {"_kx", "fbclid", "gclid", "mc_cid", "mc_eid", "nb_klid", "ref_src"}
PRIVATE_HOST_MARKERS = (".lan", ".local", ".internal")
DEFAULT_SOCIAL_HOSTS = {
    "blog.ooblik.com",
    "instagram.com",
    "ooblik.tumblr.com",
    "twitter.com",
    "www.instagram.com",
}
ACCOUNT_PATH = re.compile(r"(?:^|/)(?:account|admin|console|login|webmail)(?:/|$)", re.I)
ACCOUNT_HOST = re.compile(
    r"(?:^|\.)(?:admin|console|mail)\.|"
    r"^(?:docs|drive|mail)\.google\.com$",
    re.I,
)


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
    if parts.username or parts.password:
        raise ValueError("URL contains embedded credentials")

    port = parts.port
    netloc = host
    if port and not (
        (parts.scheme.lower() == "http" and port == 80)
        or (parts.scheme.lower() == "https" and port == 443)
    ):
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
    return urlunsplit(
        (parts.scheme.lower(), netloc, path, urlencode(query, doseq=True), fragment)
    )


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
        ("IA & Agents", r"\bai\b|\bia\b|llm|agent|codex|claude|model|token|rag"),
        (
            "Design & Création",
            r"photo|image|raw|print|pdf|zine|brush|design|penpot|editor|"
            r"layout|typograph|font|typeface|illustrat|art",
        ),
        (
            "Médias & Veille",
            r"journal|news|media|newsletter|magazine|presse|veille|society|"
            r"société|politique",
        ),
    ]
    for category, pattern in rules:
        if re.search(pattern, text):
            return category
    return "Développement"


def is_account_like(url: str) -> bool:
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    return bool(ACCOUNT_HOST.search(host) or ACCOUNT_PATH.search(parts.path))


def pinboard_to_digest(item: dict[str, object]) -> dict[str, object]:
    url = canonicalize(str(item.get("href", "")))
    title = str(item.get("description", "")).strip() or infer_title(url)
    timestamp = str(item.get("time", "")).strip()
    added = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%SZ").date().isoformat()

    normalized: dict[str, object] = {
        "title": title,
        "url": url,
        "category": infer_category(title, url),
        "added": added,
    }
    description = str(item.get("extended", "")).strip()
    if description:
        normalized["description"] = description
    tags = [tag for tag in str(item.get("tags", "")).split() if tag]
    if tags:
        normalized["tags"] = tags
    return normalized


def metadata_score(item: dict[str, object]) -> tuple[int, int, str]:
    return (
        int(bool(item.get("description"))),
        len(item.get("tags", [])) if isinstance(item.get("tags"), list) else 0,
        str(item.get("added", "")),
    )


def deduplicate(items: list[dict[str, object]]) -> tuple[list[dict[str, object]], int]:
    by_url: dict[str, dict[str, object]] = {}
    duplicates = 0
    for item in items:
        url = str(item["url"])
        current = by_url.get(url)
        if current is None:
            by_url[url] = item
            continue
        duplicates += 1
        if metadata_score(item) > metadata_score(current):
            by_url[url] = item
    return list(by_url.values()), duplicates


def sort_items(items: list[dict[str, object]]) -> list[dict[str, object]]:
    return sorted(
        items,
        key=lambda item: (
            str(item["added"]),
            str(item["title"]).casefold(),
            str(item["url"]),
        ),
        reverse=True,
    )


def chunks(items: list[dict[str, object]], size: int) -> list[list[dict[str, object]]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def write_batches(
    output: Path,
    stream: str,
    items: list[dict[str, object]],
    max_batch_size: int,
) -> list[dict[str, object]]:
    by_month: dict[str, list[dict[str, object]]] = defaultdict(list)
    for item in sort_items(items):
        by_month[str(item["added"])[:7]].append(item)

    records: list[dict[str, object]] = []
    for month in sorted(by_month, reverse=True):
        month_items = by_month[month]
        year = month[:4]
        pending: list[tuple[str, list[dict[str, object]]]] = []

        if len(month_items) <= max_batch_size:
            pending.append((month, month_items))
        else:
            by_week: dict[str, list[dict[str, object]]] = defaultdict(list)
            for item in month_items:
                added = date.fromisoformat(str(item["added"]))
                _, iso_week, _ = added.isocalendar()
                by_week[f"{month}-W{iso_week:02d}"].append(item)
            pending.extend(sorted(by_week.items(), reverse=True))

        for stem, period_items in pending:
            period_chunks = chunks(sort_items(period_items), max_batch_size)
            for index, batch in enumerate(period_chunks, start=1):
                suffix = f"-part-{index:02d}" if len(period_chunks) > 1 else ""
                relative_path = Path(stream) / year / f"{stem}{suffix}.json"
                write_json(output / relative_path, batch)
                records.append(
                    {
                        "path": relative_path.as_posix(),
                        "count": len(batch),
                        "date_from": min(str(item["added"]) for item in batch),
                        "date_to": max(str(item["added"]) for item in batch),
                    }
                )
    return records


def validate_batches(output: Path, records: list[dict[str, object]]) -> None:
    seen: set[str] = set()
    for record in records:
        path = output / str(record["path"])
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, list) or len(payload) != record["count"]:
            raise ValueError(f"invalid batch payload: {path}")
        for item in payload:
            required = {"title", "url", "category", "added"}
            if not required.issubset(item):
                raise ValueError(f"missing required field in {path}")
            date.fromisoformat(str(item["added"]))
            url = canonicalize(str(item["url"]))
            if url != item["url"]:
                raise ValueError(f"non-canonical URL in {path}: {item['url']}")
            if url in seen:
                raise ValueError(f"duplicate URL across batches: {url}")
            seen.add(url)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Pinboard JSON export")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("import/pinboard"),
        help="Generated workbench directory (default: import/pinboard)",
    )
    parser.add_argument(
        "--max-batch-size",
        type=int,
        default=30,
        help="Maximum entries per generated batch (default: 30)",
    )
    parser.add_argument(
        "--social-host",
        action="append",
        default=[],
        help="Additional host to route to social-personal review",
    )
    args = parser.parse_args()

    if args.max_batch_size < 1:
        parser.error("--max-batch-size must be positive")

    input_path = args.input.resolve()
    output = args.output.resolve()
    workspace = Path.cwd().resolve()
    if not input_path.is_file():
        parser.error(f"input file not found: {input_path}")
    try:
        output_relative = output.relative_to(workspace)
    except ValueError:
        parser.error("output directory must stay inside the current workspace")
    if len(output_relative.parts) < 2 or output == input_path.parent:
        parser.error("refusing to use a broad output directory")

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("Pinboard export root must be a JSON array")

    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)

    social_hosts = DEFAULT_SOCIAL_HOSTS | {
        host.strip().lower() for host in args.social_host if host.strip()
    }
    candidates: list[dict[str, object]] = []
    social_personal: list[dict[str, object]] = []
    private: list[dict[str, object]] = []
    unsafe: list[dict[str, object]] = []
    invalid: list[dict[str, object]] = []
    host_counts: Counter[str] = Counter()

    for source_index, item in enumerate(payload):
        if not isinstance(item, dict):
            invalid.append({"source_index": source_index, "reason": "entry is not an object"})
            continue
        if str(item.get("shared", "")).lower() != "yes":
            private.append(
                {
                    "source_index": source_index,
                    "reason": "private Pinboard bookmark",
                    "item": item,
                }
            )
            continue
        try:
            normalized = pinboard_to_digest(item)
        except (TypeError, ValueError) as exc:
            invalid.append(
                {"source_index": source_index, "reason": str(exc), "item": item}
            )
            continue

        url = str(normalized["url"])
        if is_account_like(url):
            unsafe.append(
                {
                    "source_index": source_index,
                    "reason": "account, authentication, or administration-like URL",
                    "item": item,
                }
            )
            continue

        host = (urlsplit(url).hostname or "").lower()
        host_counts[host] += 1
        if host in social_hosts:
            social_personal.append(normalized)
        else:
            candidates.append(normalized)

    candidates, candidate_duplicates = deduplicate(candidates)
    social_personal, social_duplicates = deduplicate(social_personal)

    candidate_records = write_batches(
        output, "batches", candidates, args.max_batch_size
    )
    social_records = write_batches(
        output, "review/social-personal", social_personal, args.max_batch_size
    )
    write_json(output / "excluded/private.json", private)
    write_json(output / "excluded/unsafe.json", unsafe)
    write_json(output / "excluded/invalid.json", invalid)

    all_records = candidate_records + social_records
    validate_batches(output, all_records)

    source_bytes = input_path.read_bytes()
    manifest = {
        "source": {
            "path": (
                input_path.relative_to(workspace).as_posix()
                if input_path.is_relative_to(workspace)
                else input_path.as_posix()
            ),
            "sha256": hashlib.sha256(source_bytes).hexdigest(),
            "bytes": len(source_bytes),
            "entries": len(payload),
        },
        "policy": {
            "max_batch_size": args.max_batch_size,
            "social_personal_hosts": sorted(social_hosts),
            "private_bookmarks_are_never_publishable": True,
        },
        "counts": {
            "input": len(payload),
            "candidates": len(candidates),
            "social_personal_review": len(social_personal),
            "private_excluded": len(private),
            "unsafe_excluded": len(unsafe),
            "invalid_excluded": len(invalid),
            "canonical_duplicates_removed": candidate_duplicates + social_duplicates,
            "candidate_batches": len(candidate_records),
            "social_personal_batches": len(social_records),
        },
        "date_range": {
            "from": min(str(item["added"]) for item in candidates + social_personal),
            "to": max(str(item["added"]) for item in candidates + social_personal),
        },
        "top_public_hosts": [
            {"host": host, "count": count}
            for host, count in host_counts.most_common(20)
        ],
        "batches": {
            "candidates": candidate_records,
            "social_personal_review": social_records,
        },
    }
    write_json(output / "manifest.json", manifest)
    (output / "README.md").write_text(
        "# Atelier d’import Pinboard\n\n"
        "- `batches/` : candidats publics convertis au contrat du Digest.\n"
        "- `review/social-personal/` : publications sociales et sites personnels à "
        "examiner séparément.\n"
        "- `excluded/private.json` : signets privés, à ne jamais publier.\n"
        "- `excluded/unsafe.json` : pages de compte, d’authentification ou "
        "d’administration.\n"
        "- `excluded/invalid.json` : entrées non convertibles.\n"
        "- `manifest.json` : empreinte de la source, règles, comptes et liste des lots.\n\n"
        "Les lots sont mensuels jusqu’à 30 entrées. Les mois plus chargés sont "
        "subdivisés par semaine ISO, puis en parties de 30 entrées maximum.\n",
        encoding="utf-8",
    )

    print(
        " ".join(
            [
                f"input={len(payload)}",
                f"candidates={len(candidates)}",
                f"social_personal={len(social_personal)}",
                f"private={len(private)}",
                f"unsafe={len(unsafe)}",
                f"invalid={len(invalid)}",
                f"duplicates={candidate_duplicates + social_duplicates}",
                f"candidate_batches={len(candidate_records)}",
                f"social_batches={len(social_records)}",
            ]
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
