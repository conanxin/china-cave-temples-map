import json
import tempfile
import unittest
from pathlib import Path

from apply_reviewed_extent_patch import apply_patch_file


def make_patch(status="human-approved"):
    patch = {
        "schemaVersion": 1,
        "patchId": "patch-1",
        "siteId": 5,
        "siteCode": "05",
        "extentId": "05-property",
        "sourceSessionId": "session-1",
        "createdAt": "2026-09-13T00:00:00Z",
        "reviewStatus": status,
        "geometryWgs84": {"type": "Polygon", "coordinates": [[[100, 30], [101, 30], [101, 31], [100, 30]]]},
        "geometryGcj02": {"type": "Polygon", "coordinates": [[[100.1, 30.1], [101.1, 30.1], [101.1, 31.1], [100.1, 30.1]]]},
        "qa": {"readiness": "strong", "fitRmseM": 1, "fitMaxResidualM": 2},
    }
    if status == "human-approved":
        patch["confirmation"] = {"token": "APPROVE 05 05-property", "confirmedAt": "2026-09-13T01:00:00Z"}
    return patch


class ApplyReviewedExtentPatchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.registry = self.root / "reviewedExtentPatches.json"
        self.registry.write_text("[]\n", encoding="utf-8")
        self.patch_file = self.root / "patch.json"

    def tearDown(self):
        self.tmp.cleanup()

    def write_patch(self, patch):
        self.patch_file.write_text(json.dumps(patch), encoding="utf-8")

    def test_rejects_draft_patch(self):
        self.write_patch(make_patch("draft-unreviewed"))
        with self.assertRaisesRegex(ValueError, "human-approved"):
            apply_patch_file(self.patch_file, self.registry)
        self.assertEqual(json.loads(self.registry.read_text()), [])

    def test_appends_human_approved_patch(self):
        self.write_patch(make_patch())
        result = apply_patch_file(self.patch_file, self.registry)
        self.assertEqual(result["status"], "applied")
        stored = json.loads(self.registry.read_text())
        self.assertEqual(len(stored), 1)
        self.assertEqual(stored[0]["extentId"], "05-property")

    def test_rejects_duplicate_site_extent_by_default(self):
        self.write_patch(make_patch())
        apply_patch_file(self.patch_file, self.registry)
        second = make_patch(); second["patchId"] = "patch-2"
        self.write_patch(second)
        with self.assertRaisesRegex(ValueError, "already contains"):
            apply_patch_file(self.patch_file, self.registry)
        self.assertEqual(len(json.loads(self.registry.read_text())), 1)


if __name__ == "__main__":
    unittest.main()
