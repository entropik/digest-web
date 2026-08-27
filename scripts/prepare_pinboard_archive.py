#!/usr/bin/env python3
"""Prepare the public Pinboard archive and its daily Hugo archive pages."""

from __future__ import annotations

import argparse
import html
import json
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit


HTTP_ERROR_TITLE = re.compile(r"^\((\d{3})\)\s*(.*)$", re.S)
URL_TITLE = re.compile(r"^https?://", re.I)
PLACEHOLDER_TITLE = re.compile(
    r"^(?:untitled|sans titre|no title)(?:\s*(?:\(|\[|[-–—:]).*)?$",
    re.I | re.S,
)
VALID_CATEGORIES = {
    "Développement",
    "Design & Création",
    "IA & Agents",
    "Médias & Veille",
}
UNRELATED_REDIRECT_URLS = {
    "http://topofy.com/2016/09/12/website-building",
    "http://www.invisionapp.com/tshirt",
    "http://rue89.nouvelobs.com/2014/09/24/vu-quand-tas-signe-les-conditions-generales-dutilisation-facebook-255037",
    "http://rue89.nouvelobs.com/2014/05/25/pape-recueille-devant-mur-separation-cisjordanie-252433",
    "https://www.eyeem.com/p/69223513",
    "http://info.arte.tv/fr/photographie-le-tourisme-de-la-desolation",
    "https://ooblik.wetransfer.com/",
    "http://piwee.net/1piege-loup-hipster-street-art-new-york010914",
    "http://fr.actuphoto.com/p/atelier-ooblik",
    "http://www.lesgraphisteries.com/2014/07/21/des-graphistes-a-bercy",
    "https://atom.io/",
    "https://dearfcc.org/",
    "http://internet.org/",
    "https://www.createspace.com/",
    "https://chrome.google.com/webstore/detail/pablo/gfpibnlcombjoeejlongmihndgkpnjjo",
}
MONTHS_FR = (
    "",
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
)


def host_label(url: str) -> str:
    host = (urlsplit(url).hostname or "le web").lower()
    return host.removeprefix("www.")


def readable_title(url: str) -> str:
    parts = urlsplit(url)
    host = (parts.hostname or "").lower().removeprefix("www.")
    query = parse_qs(parts.query)

    if host == "youtube.com" and query.get("v"):
        return f"Vidéo YouTube {query['v'][0]}"
    if host == "vimeo.com":
        video_id = next(
            (segment for segment in reversed(parts.path.split("/")) if segment.isdigit()),
            "",
        )
        return f"Vidéo Vimeo {video_id}".strip()
    if host == "photos.google.com" and parts.path.startswith("/share/"):
        return "Album Google Photos"
    if host == "info.cern.ch" and parts.path.casefold() == "/hypertext/www/theproject.html":
        return "The World Wide Web project"
    if "ebay." in host and query.get("item"):
        return f"Annonce eBay {query['item'][0]}"

    segments = [
        unquote(segment)
        for segment in parts.path.split("/")
        if segment and segment.lower() not in {"index.html", "index.htm", "error", "404"}
    ]
    candidate = segments[-1] if segments else host
    if candidate.casefold() == "index.php" and parts.query:
        query_path = unquote(parts.query).rstrip("=")
        candidate = query_path.rsplit("/", 1)[-1]
        candidate = re.sub(r"^\d+-", "", candidate)
        if candidate.casefold() == "etrange":
            candidate = "Étrange"
    if host == "storehouse.co":
        candidate = re.sub(r"^[a-z]\w{4}-", "", candidate, flags=re.I)
    candidate = re.sub(r"\.(?:html?|php|aspx?)$", "", candidate, flags=re.I)
    candidate = re.sub(r"[-_]+", " ", candidate)
    candidate = re.sub(r"\s+art\d+$", "", candidate, flags=re.I)
    candidate = re.sub(r"\s+", " ", candidate).strip()
    if not candidate or candidate.isdigit():
        candidate = host
    return candidate[:1].upper() + candidate[1:]


def clean_title(raw_title: str, url: str) -> tuple[str, int | None]:
    title = html.unescape(raw_title).strip()
    error_code: int | None = None
    match = HTTP_ERROR_TITLE.match(title)
    if match:
        error_code = int(match.group(1))
        title = match.group(2).strip()
    if not title or URL_TITLE.match(title) or PLACEHOLDER_TITLE.match(title):
        title = readable_title(url)
    title = re.sub(r"\s+", " ", title).strip()
    return title or host_label(url), error_code


def infer_category(item: dict[str, object], title: str) -> str:
    tags = " ".join(str(tag) for tag in item.get("tags", []))
    text = " ".join(
        (
            title,
            str(item.get("description", "")),
            tags,
            str(item.get("url", "")),
        )
    ).casefold()

    rules = (
        (
            "IA & Agents",
            r"\b(?:ai|ia|llm|gpt|agent|machine learning|deep learning|neural|"
            r"intelligence artificielle)\b",
        ),
        (
            "Design & Création",
            r"photo|photograph|image|vimeo|youtube|film|video|cin[eé]ma|art|"
            r"peint|dessin|illustr|typograph|font|design|print|impress|tirage|"
            r"livre|book|zine|galerie|museum|mus[eé]e|exposition|portrait|"
            r"architecture|creative|graph",
        ),
        (
            "Médias & Veille",
            r"journal|news|newsletter|presse|polit|soci[eé]t[eé]|ukraine|"
            r"lib[eé]ration|lemonde|mediapart|rue89|diplomatique|magazine|"
            r"interview|entretien|campagne-archive|tinyletter|tumblr",
        ),
    )
    for category, pattern in rules:
        if re.search(pattern, text):
            return category
    return "Développement"


def clean_tags(item: dict[str, object], category: str, url: str) -> list[str]:
    tags: list[str] = []
    for raw_tag in item.get("tags", []):
        tag = str(raw_tag).strip().lstrip("#")
        if tag and tag.casefold() not in {current.casefold() for current in tags}:
            tags.append(tag)

    category_tag = {
        "Développement": "développement",
        "Design & Création": "création",
        "IA & Agents": "IA",
        "Médias & Veille": "veille",
    }[category]
    if category_tag.casefold() not in {tag.casefold() for tag in tags}:
        tags.append(category_tag)

    host = host_label(url)
    service_tags = {
        "youtube.com": "youtube",
        "youtu.be": "youtube",
        "vimeo.com": "vimeo",
        "github.com": "github",
        "kickstarter.com": "kickstarter",
        "medium.com": "medium",
        "tinyletter.com": "newsletter",
    }
    service_tag = service_tags.get(host)
    if service_tag and service_tag.casefold() not in {tag.casefold() for tag in tags}:
        tags.append(service_tag)
    return tags[:8]


def curate_item(item: dict[str, object]) -> dict[str, object]:
    url = str(item["url"]).strip()
    title, error_code = clean_title(str(item.get("title", "")), url)
    category = infer_category(item, title)
    curated: dict[str, object] = {
        "title": title,
        "url": url,
        "category": category,
        "added": str(item["added"]),
    }

    description = html.unescape(str(item.get("description", ""))).strip()
    if description:
        curated["description"] = re.sub(r"\s+", " ", description)
    else:
        curated["description"] = (
            f"Ressource « {title} » archivée depuis {host_label(url)} "
            "dans la collection historique du Digest."
        )

    tags = clean_tags(item, category, url)
    if error_code and error_code >= 400:
        curated["status"] = "dead"
        curated["status_note"] = (
            f"La destination était signalée en erreur HTTP {error_code} dans "
            "l’export Pinboard. L’adresse publique d’origine est conservée pour mémoire."
        )
        if "lien-mort" not in tags:
            tags.append("lien-mort")
    if tags:
        curated["tags"] = tags
    return curated


def load_candidates(root: Path) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for path in sorted((root / "batches").rglob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise ValueError(f"{path}: une liste JSON était attendue")
        items.extend(dict(item) for item in payload)
    return items


def is_known_editorial_alias(item: dict[str, object], daily_items: list[dict[str, object]]) -> bool:
    parts = urlsplit(str(item["url"]))
    if parts.hostname != "atelier.ooblik.com" or parts.path not in {"", "/"}:
        return False
    if "p" not in parse_qs(parts.query):
        return False
    return any(
        urlsplit(str(other["url"])).hostname == parts.hostname
        and urlsplit(str(other["url"])).path not in {"", "/"}
        for other in daily_items
    )


def apply_probe_results(
    items: list[dict[str, object]], probe_path: Path | None
) -> tuple[list[dict[str, object]], dict[str, int]]:
    if probe_path is None or not probe_path.exists():
        return items, {"newly_dead": 0, "redirected_dead": 0, "excluded_auth": 0}
    payload = json.loads(probe_path.read_text(encoding="utf-8"))
    evidence: dict[str, dict[str, object]] = {
        str(result.get("url", "")): result
        for result in payload
        if isinstance(result, dict)
    }
    newly_dead = 0
    redirected_dead = 0
    excluded_auth = 0
    kept: list[dict[str, object]] = []
    for item in items:
        result = evidence.get(str(item["url"]), {})
        final_host = host_label(str(result.get("final_url", "")))
        if final_host == "accounts.google.com":
            excluded_auth += 1
            continue
        kept.append(item)
        if item.get("status") == "dead":
            continue
        original_host = host_label(str(item["url"]))
        is_mailchimp_tombstone = (
            final_host == "mailchimp.com"
            and (
                "campaign-archive" in original_host
                or original_host == "tinyletter.com"
            )
        )
        is_unrelated_redirect = str(item["url"]) in UNRELATED_REDIRECT_URLS
        if not result.get("definitive_dead") and not (
            is_mailchimp_tombstone or is_unrelated_redirect
        ):
            continue
        item["status"] = "dead"
        if is_mailchimp_tombstone or is_unrelated_redirect:
            item["status_note"] = (
                "L’adresse redirige désormais vers une page générique ou un "
                "service sans rapport avec la ressource décrite. L’URL d’origine "
                "est conservée pour mémoire."
            )
            redirected_dead += 1
        elif result.get("status") in {404, 410}:
            item["status_note"] = (
                f"La destination renvoie aujourd’hui une erreur HTTP "
                f"{result['status']}. L’adresse publique d’origine est conservée "
                "pour mémoire."
            )
        else:
            item["status_note"] = (
                "Le domaine public d’origine ne répond plus au DNS. "
                "L’adresse est conservée pour mémoire."
            )
        tags = [str(tag) for tag in item.get("tags", [])]
        if "lien-mort" not in tags:
            tags.append("lien-mort")
        item["tags"] = tags
        newly_dead += 1
    return kept, {
        "newly_dead": newly_dead,
        "redirected_dead": redirected_dead,
        "excluded_auth": excluded_auth,
    }


def prepare(
    root: Path, output: Path, probe_path: Path | None = None
) -> dict[str, int]:
    raw_items = load_candidates(root)
    pilot_path = root / "curated" / "2014-02.json"
    pilot_items = json.loads(pilot_path.read_text(encoding="utf-8"))

    by_date: dict[str, list[dict[str, object]]] = defaultdict(list)
    for item in raw_items:
        by_date[str(item["added"])].append(item)

    selected: list[dict[str, object]] = []
    aliases = 0
    for item in raw_items:
        if str(item["added"]).startswith("2014-02-"):
            continue
        if is_known_editorial_alias(item, by_date[str(item["added"])]):
            aliases += 1
            continue
        selected.append(curate_item(item))
    selected.extend(dict(item) for item in pilot_items)
    selected, probe_stats = apply_probe_results(selected, probe_path)

    unique: dict[str, dict[str, object]] = {}
    duplicate_urls = 0
    for item in selected:
        url = str(item["url"])
        if url in unique:
            duplicate_urls += 1
            continue
        unique[url] = item

    curated = sorted(
        unique.values(),
        key=lambda item: (str(item["added"]), str(item["title"]).casefold()),
        reverse=True,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(curated, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return {
        "raw": len(raw_items),
        "pilot": len(pilot_items),
        "aliases": aliases,
        "duplicates": duplicate_urls,
        "curated": len(curated),
        "dead": sum(item.get("status") == "dead" for item in curated),
        "newly_dead_from_probe": probe_stats["newly_dead"],
        "redirected_dead": probe_stats["redirected_dead"],
        "excluded_auth": probe_stats["excluded_auth"],
        "dates": len({str(item["added"]) for item in curated}),
    }


def plural_links(count: int) -> str:
    return "un lien" if count == 1 else f"{count} liens"


def create_archives(site: Path) -> dict[str, int]:
    links = json.loads((site / "data" / "links.json").read_text(encoding="utf-8"))
    by_date: dict[str, list[dict[str, object]]] = defaultdict(list)
    for item in links:
        by_date[str(item["added"])].append(item)

    archives_dir = site / "content" / "archives"
    archives_dir.mkdir(parents=True, exist_ok=True)
    created = 0
    preserved = 0
    for iso_date, daily_links in sorted(by_date.items()):
        path = archives_dir / f"{iso_date}.md"
        if path.exists():
            preserved += 1
            continue
        parsed = date.fromisoformat(iso_date)
        count = len(daily_links)
        dead = sum(item.get("status") == "dead" for item in daily_links)
        title = f"{parsed.day} {MONTHS_FR[parsed.month]} {parsed.year}"
        description = (
            f"Archive chronologique du Digest : {plural_links(count)} "
            f"enregistré{'s' if count > 1 else ''} le "
            f"{parsed.day} {MONTHS_FR[parsed.month]} {parsed.year}."
        )
        archived_subject = (
            "le lien enregistré"
            if count == 1
            else f"les {count} liens enregistrés"
        )
        body = (
            f"Cette édition restitue {archived_subject} dans Pinboard à cette "
            "date, sans déplacer les ressources dans le temps."
        )
        if dead:
            body += (
                f" {plural_links(dead).capitalize()} aujourd’hui indisponible"
                f"{'s sont' if dead > 1 else ' est'} conservé"
                f"{'s' if dead > 1 else ''} pour mémoire."
            )
        front_matter = (
            "---\n"
            f"title: {json.dumps(title, ensure_ascii=False)}\n"
            f"date: {iso_date}\n"
            f'digest_date: "{iso_date}"\n'
            f"description: {json.dumps(description, ensure_ascii=False)}\n"
            "---\n\n"
            f"{body}\n"
        )
        path.write_text(front_matter, encoding="utf-8")
        created += 1
    return {"created": created, "preserved": preserved, "dates": len(by_date)}


def clean_site_titles(site: Path) -> dict[str, int]:
    links_path = site / "data" / "links.json"
    links = json.loads(links_path.read_text(encoding="utf-8"))
    changed = 0
    descriptions = 0

    for item in links:
        old_title = str(item.get("title", ""))
        new_title, _ = clean_title(old_title, str(item["url"]))
        if new_title == old_title:
            continue

        item["title"] = new_title
        changed += 1
        description = str(item.get("description", ""))
        old_prefix = f"Ressource « {old_title} » archivée depuis "
        if description.startswith(old_prefix):
            item["description"] = (
                f"Ressource « {new_title} » archivée depuis "
                f"{description.removeprefix(old_prefix)}"
            )
            descriptions += 1

    remaining = sum(
        bool(PLACEHOLDER_TITLE.match(str(item.get("title", "")).strip()))
        for item in links
    )
    if changed:
        links_path.write_text(
            json.dumps(links, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return {
        "titles_changed": changed,
        "descriptions_changed": descriptions,
        "placeholder_titles_remaining": remaining,
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
        default=Path("import/pinboard/curated/all-public.json"),
        help="JSON public curaté à produire.",
    )
    parser.add_argument(
        "--probe-results",
        type=Path,
        default=Path("import/pinboard/probe-results.json"),
        help="Résultats facultatifs de probe_public_links.mjs.",
    )
    parser.add_argument(
        "--archives",
        action="store_true",
        help="Créer les pages d’archives manquantes depuis data/links.json.",
    )
    parser.add_argument(
        "--clean-titles",
        action="store_true",
        help="Remplacer les titres techniques de data/links.json par des libellés lisibles.",
    )
    parser.add_argument(
        "--site",
        type=Path,
        default=Path.cwd(),
        help="Racine Hugo utilisée avec --archives.",
    )
    args = parser.parse_args()

    if args.clean_titles:
        print(json.dumps(clean_site_titles(args.site.resolve()), ensure_ascii=False))
    elif args.archives:
        print(json.dumps(create_archives(args.site.resolve()), ensure_ascii=False))
    else:
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
