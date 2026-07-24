---
name: curate-web-digest
description: Curate batches of web links into a Hugo digest by extracting URLs from JSON or Markdown, removing tracking parameters, rejecting private or unsafe targets, deduplicating, classifying, and merging entries into data/links.json. Use when Codex needs to turn browser tabs, bookmarks, exported reading lists, newsletter links, or pasted Markdown links into a clean, publishable Hugo/PaperMod collection.
---

# Curate Web Digest

Transform a loose collection of public links into a deterministic Hugo data file. Preserve editorial choice: automate normalization and obvious classification, but review titles, categories, and exclusions before publishing.

## Workflow

1. Locate the Hugo project and inspect its existing `data/links.json`.
2. Save the supplied links as JSON or Markdown without adding credentials, private URLs, or browser-session parameters.
3. Run the bundled importer:

   ```powershell
   python scripts/curate_links.py <input> --site <hugo-project>
   ```

4. Read the summary and inspect warnings. Never publish skipped private, local, authentication, account, or administration URLs.
5. Review the changed JSON. Correct editorial titles and borderline categories rather than treating inference as ground truth.
6. Validate the data and build:

   ```powershell
   python scripts/curate_links.py --check --site <hugo-project>
   hugo --minify
   ```

7. Report counts for input, accepted, skipped, duplicates, and final total.
8. When the site exposes tag archives, add `--tag-pages` to regenerate one Hugo page per unique tag.

## Input formats

- JSON: a list of objects with at least `url`; optional fields are `title`, `category`, `added`, `description`, and `tags`.
- Markdown: standard `[title](https://example.com)` links and bare `http(s)` URLs. Structured `##` sections containing `### [title](url)`, a description paragraph, and a `**Tags :**` line preserve full editorial metadata.

Read [references/data-contract.md](references/data-contract.md) when changing the Hugo data model or integrating another source format.

## Curation rules

- Keep only public `http` and `https` URLs.
- Canonicalize hosts, trailing slashes, fragments, and known tracking parameters.
- Deduplicate on canonical URL, not title.
- Prefer the supplied title. Derive a short readable title only when absent.
- Preserve an existing entry when an incoming duplicate has less metadata.
- Treat category inference as a first pass. Use the project's current taxonomy.
- Do not fetch every destination merely to enrich metadata unless the user asks for enrichment.
- Do not import browser mail, account, console, payment, local-network, or authenticated application pages.
- Keep the operation idempotent: rerunning the same input must not add entries.

## Script options

- Use `--dry-run` to inspect counts without writing.
- Use `--replace` only when the user explicitly wants to discard the existing collection.
- Use `--check` to validate the current `data/links.json` without an input file.
- Use `--date YYYY-MM-DD` to set the fallback addition date.
- Use `--tag-pages` to generate `content/tags/` pages from the unique tags in the resulting collection.

If validation fails, fix the source data or script and rerun both checks. Do not hand-edit generated output in a way the next import would undo.
