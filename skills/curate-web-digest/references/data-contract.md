# Data contract

Store the curated collection in `<site>/data/links.json` as a JSON array.

Each item has:

- `title`: non-empty reader-facing string.
- `url`: canonical public HTTP(S) URL, unique in the array.
- `category`: non-empty taxonomy label.
- `added`: ISO date in `YYYY-MM-DD` format.
- `description`: optional short reader-facing summary.
- `tags`: optional array of reader-facing tags without the leading `#`.
- `status`: optional lifecycle marker. Use `dead` when the original public
  address no longer resolves to its documented resource but must be preserved
  for historical purposes.
- `status_note`: optional reader-facing explanation of the lifecycle status.
- `stream`: optional slug for a historical source stream kept outside the
  editorial homepage, such as `twitter`, `instagram`, `tumblr-ooblik`, or
  `blog-ooblik`.

Example:

```json
{
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
