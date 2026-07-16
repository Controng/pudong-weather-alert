"""
Seed data/warnings.json with the sample data from docs/data/warnings.json.
This lets you preview the email module without a real network scrape.
"""

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "data" / "warnings.json"
DST = ROOT / "data" / "warnings.json"

DST.parent.mkdir(parents=True, exist_ok=True)
shutil.copy(SRC, DST)
n = len(json.loads(DST.read_text(encoding="utf-8")))
print(f"seeded {DST} with {n} sample warnings")
