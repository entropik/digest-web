from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "curate_links.py"
SPEC = importlib.util.spec_from_file_location("curate_links", SCRIPT)
assert SPEC and SPEC.loader
CURATE_LINKS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CURATE_LINKS)


class CurateLinksTests(unittest.TestCase):
    def run_import(self, site: Path, source: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                str(source),
                "--site",
                str(site),
                "--date",
                "2026-08-29",
            ],
            check=True,
            capture_output=True,
            text=True,
        )

    def test_merge_preserves_existing_catalog_bytes_and_is_idempotent(self) -> None:
        existing = [
            {
                "title": "Existing entry",
                "url": "https://example.com/existing",
                "category": "Développement",
                "added": "2026-08-28",
                "id": CURATE_LINKS.stable_link_id("https://example.com/existing"),
                "archive_text": "Opaque heritage field the importer must not discard.",
                "previous_urls": ["https://old.example.com/existing"],
            }
        ]
        incoming = [
            {
                "title": "New entry",
                "url": "https://example.org/new?utm_source=test",
                "category": "Développement",
                "added": "2026-08-29",
            }
        ]

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "data"
            data.mkdir()
            catalog = data / "links.json"
            baseline = json.dumps(existing, ensure_ascii=False, indent=2) + "\n"
            catalog.write_bytes(baseline.encode("utf-8"))
            source = root / "incoming.json"
            source.write_text(json.dumps(incoming), encoding="utf-8")

            first = self.run_import(root, source)
            merged = catalog.read_bytes()
            merged_text = merged.decode("utf-8")

            self.assertIn("accepted=1", first.stdout)
            self.assertNotIn(b"\r\n", merged)
            self.assertTrue(merged_text.endswith(baseline[1:]))
            self.assertEqual(json.loads(merged_text)[1], existing[0])

            second = self.run_import(root, source)
            self.assertIn("duplicates=1", second.stdout)
            self.assertIn("Unchanged", second.stdout)
            self.assertEqual(catalog.read_bytes(), merged)

    def test_merge_into_empty_catalog_produces_valid_json(self) -> None:
        incoming = [{"title": "First", "url": "https://example.com/first"}]

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "data"
            data.mkdir()
            catalog = data / "links.json"
            catalog.write_bytes(b"[]\n")
            source = root / "incoming.json"
            source.write_text(json.dumps(incoming), encoding="utf-8")

            self.run_import(root, source)

            self.assertEqual(len(json.loads(catalog.read_text(encoding="utf-8"))), 1)

    def test_merge_preserves_crlf_catalog_line_endings(self) -> None:
        existing = [
            {
                "title": "Existing",
                "url": "https://example.com/existing",
                "category": "Développement",
                "added": "2026-08-28",
                "id": CURATE_LINKS.stable_link_id("https://example.com/existing"),
            }
        ]
        incoming = [{"title": "New", "url": "https://example.org/new"}]

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "data"
            data.mkdir()
            catalog = data / "links.json"
            baseline = (json.dumps(existing, indent=2) + "\n").replace("\n", "\r\n")
            catalog.write_bytes(baseline.encode("utf-8"))
            source = root / "incoming.json"
            source.write_text(json.dumps(incoming), encoding="utf-8")

            self.run_import(root, source)
            merged = catalog.read_bytes()

            self.assertTrue(merged.decode("utf-8").endswith(baseline[1:]))
            self.assertNotIn(b"\n", merged.replace(b"\r\n", b""))

    def test_structured_markdown_accepts_plain_comma_separated_tags(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "incoming.md"
            source.write_text(
                "## IA & Agents\n\n"
                "### [Example](https://example.com/tool)\n\n"
                "Description.\n\n"
                "**Tags :** IA, agents, open source\n",
                encoding="utf-8",
            )

            items = CURATE_LINKS.load_input(source, "2026-08-29")

            self.assertEqual(items[0]["tags"], ["IA", "agents", "open source"])


if __name__ == "__main__":
    unittest.main()
