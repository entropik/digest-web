"""Unit tests for scripts/check_digest_consistency.py."""

from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.check_digest_consistency import validate


class TestCheckDigestConsistency(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.site = Path(self.temp_dir.name)

        # Build minimal mock site structure
        (self.site / "data").mkdir(parents=True)
        (self.site / "content" / "archives").mkdir(parents=True)
        (self.site / "content" / "tags").mkdir(parents=True)
        (self.site / "static" / "social" / "focus-archives").mkdir(parents=True)
        (self.site / "static" / "media" / "blog-ooblik").mkdir(parents=True)

        # Mock initial links.json
        self.links = [
            {
                "id": "link-1",
                "title": "Herdr",
                "url": "https://github.com/herdrdev/herdr",
                "category": "ai",
                "added": "2026-09-12",
                "visibility": "",
                "tags": ["IA", "agents"],
            },
            {
                "id": "link-2",
                "title": "Orca",
                "url": "https://github.com/stablyai/orca",
                "category": "ai",
                "added": "2026-08-29",
                "visibility": "",
                "tags": ["IA", "agents"],
            },
        ]
        (self.site / "data" / "links.json").write_text(
            json.dumps(self.links, ensure_ascii=False), encoding="utf-8"
        )

        # Mock tags
        (self.site / "content" / "tags" / "ia.md").write_text(
            '---\ntitle: "#IA"\ntag: "IA"\ntags: ["IA"]\n---\n', encoding="utf-8"
        )
        (self.site / "content" / "tags" / "agents.md").write_text(
            '---\ntitle: "#agents"\ntag: "agents"\ntags: ["agents"]\n---\n', encoding="utf-8"
        )

        # Mock archive image
        (self.site / "static" / "social" / "focus-archives" / "img-1.jpg").write_bytes(b"jpg1")
        (self.site / "static" / "social" / "focus-archives" / "img-2.jpg").write_bytes(b"jpg2")

        # Mock daily digest archive
        (self.site / "content" / "archives" / "2026-09-12.md").write_text(
            '---\ntitle: "12 septembre 2026"\ndate: 2026-09-12\ndigest_date: "2026-09-12"\neditorial_type: "digest"\n---\n',
            encoding="utf-8",
        )
        (self.site / "static" / "social" / "2026-09-12.png").write_bytes(b"png")
        (self.site / "static" / "social" / "2026-09-12-linkedin.png").write_bytes(b"png")

        # Mock archive for 2026-08-29
        (self.site / "content" / "archives" / "2026-08-29.md").write_text(
            '---\ntitle: "29 août 2026"\ndate: 2026-08-29\ndigest_date: "2026-08-29"\neditorial_type: "focus"\narchive_image: "/social/focus-archives/img-1.jpg"\n---\n',
            encoding="utf-8",
        )
        (self.site / "static" / "social" / "2026-08-29.png").write_bytes(b"png")
        (self.site / "static" / "social" / "2026-08-29-linkedin.png").write_bytes(b"png")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_valid_site_passes(self) -> None:
        errors = validate(self.site)
        self.assertEqual(errors, [])

    def test_focus_cannot_overwrite_daily_digest(self) -> None:
        # Overwrite daily digest with a focus post
        (self.site / "content" / "archives" / "2026-09-12.md").write_text(
            '---\ntitle: "Focus"\ndate: 2026-09-12\ndigest_date: "2026-09-12"\neditorial_type: "focus"\narchive_image: "/social/focus-archives/img-2.jpg"\n---\n',
            encoding="utf-8",
        )
        errors = validate(self.site)
        self.assertTrue(
            any("ne peut pas écraser" in err or "remplace indûment le Digest" in err for err in errors),
            f"Expected error for focus overwriting daily digest, got: {errors}",
        )

    def test_new_focus_must_have_slug(self) -> None:
        # Create unslugged focus for date not in historical whitelist
        (self.site / "content" / "archives" / "2026-09-15.md").write_text(
            '---\ntitle: "Focus"\ndate: 2026-09-15\ndigest_date: "2026-09-15"\neditorial_type: "focus"\narchive_image: "/social/focus-archives/img-2.jpg"\n---\n',
            encoding="utf-8",
        )
        (self.site / "static" / "social" / "2026-09-15.png").write_bytes(b"png")
        (self.site / "static" / "social" / "2026-09-15-linkedin.png").write_bytes(b"png")
        errors = validate(self.site)
        self.assertTrue(
            any("doit comporter un slug" in err for err in errors),
            f"Expected error for unslugged focus, got: {errors}",
        )

    def test_duplicate_archive_image_rejected(self) -> None:
        # Add slugged focus using img-1.jpg already used by 2026-08-29.md
        (self.site / "content" / "archives" / "2026-09-12-test.md").write_text(
            '---\ntitle: "Focus Test"\ndate: 2026-09-12\ndigest_date: "2026-09-12"\neditorial_type: "focus"\narchive_image: "/social/focus-archives/img-1.jpg"\n---\n',
            encoding="utf-8",
        )
        (self.site / "static" / "social" / "2026-09-12-test.png").write_bytes(b"png")
        (self.site / "static" / "social" / "2026-09-12-test-linkedin.png").write_bytes(b"png")
        errors = validate(self.site)
        self.assertTrue(
            any("archive_image '/social/focus-archives/img-1.jpg' déjà utilisé" in err for err in errors),
            f"Expected duplicate archive_image error, got: {errors}",
        )

    def test_missing_archive_image_file_rejected(self) -> None:
        (self.site / "content" / "archives" / "2026-09-12-test.md").write_text(
            '---\ntitle: "Focus Test"\ndate: 2026-09-12\ndigest_date: "2026-09-12"\neditorial_type: "focus"\narchive_image: "/social/focus-archives/non-existent.jpg"\n---\n',
            encoding="utf-8",
        )
        (self.site / "static" / "social" / "2026-09-12-test.png").write_bytes(b"png")
        (self.site / "static" / "social" / "2026-09-12-test-linkedin.png").write_bytes(b"png")
        errors = validate(self.site)
        self.assertTrue(
            any("fichier archive_image introuvable" in err for err in errors),
            f"Expected missing image file error, got: {errors}",
        )

    def test_link_urls_must_exist_in_public_catalog(self) -> None:
        # Add link_urls with an unknown URL
        (self.site / "content" / "archives" / "2026-09-12-test.md").write_text(
            '---\ntitle: "Focus Test"\ndate: 2026-09-12\ndigest_date: "2026-09-12"\neditorial_type: "focus"\narchive_image: "/social/focus-archives/img-2.jpg"\nlink_urls:\n  - "https://github.com/herdrdev/herdr"\n  - "https://example.com/unknown"\n---\n',
            encoding="utf-8",
        )
        (self.site / "static" / "social" / "2026-09-12-test.png").write_bytes(b"png")
        (self.site / "static" / "social" / "2026-09-12-test-linkedin.png").write_bytes(b"png")
        errors = validate(self.site)
        self.assertTrue(
            any("introuvable dans le catalogue public" in err and "https://example.com/unknown" in err for err in errors),
            f"Expected error for missing link_urls in catalog, got: {errors}",
        )

    def test_missing_social_image_rejected(self) -> None:
        (self.site / "content" / "archives" / "2026-09-12-test.md").write_text(
            '---\ntitle: "Focus Test"\ndate: 2026-09-12\ndigest_date: "2026-09-12"\neditorial_type: "focus"\narchive_image: "/social/focus-archives/img-2.jpg"\n---\n',
            encoding="utf-8",
        )
        # Only create landscape, missing linkedin
        (self.site / "static" / "social" / "2026-09-12-test.png").write_bytes(b"png")
        errors = validate(self.site)
        self.assertTrue(
            any("visuel social LinkedIn manquant" in err for err in errors),
            f"Expected missing LinkedIn social visual error, got: {errors}",
        )


if __name__ == "__main__":
    unittest.main()
