# Data contract

Store the curated collection in `<site>/data/links.json` as a JSON array.

Each item has:

- `title`: non-empty reader-facing string.
- `url`: canonical public HTTP(S) URL, unique in the array.
- `category`: non-empty taxonomy label.
- `added`: ISO date in `YYYY-MM-DD` format.
- `description`: optional short reader-facing summary.
- `tags`: optional array of reader-facing tags without the leading `#`.

Example:

```json
{
  "title": "Example project",
  "url": "https://example.com/project",
  "category": "Development",
  "added": "2026-07-24",
  "description": "A short factual description.",
  "tags": ["example", "reference"]
}
```

The importer sorts newest entries first, then by title. Existing metadata wins when the same canonical URL appears again.
