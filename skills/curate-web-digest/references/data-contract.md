# Data contract

Store the curated collection in `<site>/data/links.json` as a JSON array.

Each item has:

- `id`: stable UUID identifying the record independently from its URL.
- `title`: non-empty reader-facing string.
- `url`: canonical public HTTP(S) URL, unique in the array.
- `category`: non-empty taxonomy label.
- `added`: ISO date in `YYYY-MM-DD` format.
- `description`: optional short reader-facing summary.
- `tags`: optional array of reader-facing tags without the leading `#`.
- `status`: optional `dead` marker for a vanished public resource.
- `status_note`: reader-facing explanation retained with a dead link.
- `archive_url`: optional timestamped HTTPS replay URL on `web.archive.org`.
- `archive_timestamp`: the 14-digit timestamp encoded in `archive_url`.
- `archive_scope`: `url` for the exact resource or `site` when the resolver had
  to fall back to the original site root.
- `archive_status`: `missing` only when Wayback has no usable capture.
- `archive_checked_at`: ISO date of the latest Wayback lookup.
- `visibility`: optional `hidden` marker for an editorial removal.
- `hidden_at`: required ISO timestamp when `visibility` is `hidden`.

The canonical `url` is never replaced by `archive_url`: it remains the
historical address displayed to readers and used for deduplication.
- `status`: optional lifecycle marker. Use `dead` when the original public
  address no longer resolves to its documented resource but must be preserved
  for historical purposes.
- `status_note`: optional reader-facing explanation of the lifecycle status.
- `stream`: optional slug for a historical source stream kept outside the
  editorial homepage, such as `twitter`, `instagram`, `tumblr-ooblik`, or
  `blog-ooblik`.
- `image`: optional local public path below `/media/blog-ooblik/` for an
  imported Blog OOBLIK illustration.
- `image_alt`: WordPress alternative text for `image`, or an empty string when
  the illustration is decorative.
- `origin_url`: optional original WordPress permalink retained as provenance;
  `url` remains the external destination of the card.

Example:

```json
{
  "id": "ebd768df-0bfa-5e55-9af8-776fbb2fdd31",
  "title": "Example project",
  "url": "https://example.com/project",
  "category": "Development",
  "added": "2026-07-24",
  "description": "A short factual description.",
  "tags": ["example", "reference"],
  "status": "dead",
  "status_note": "Dead link — preserved as part of the historical record."
}
```

The importer sorts newest entries first, then by title. Existing metadata wins
when the same canonical URL appears again. A dead public link is valid data: do
not discard it merely because the remote server or resource has disappeared.
