#!/usr/bin/env python3
"""Export job_search_tracker.csv to a pipeline-tracker backup JSON.

Targets a client-side job-pipeline tracker web app whose "Restore Backup"
setting accepts a JSON array of job objects and merges by lowercase
"company__role" (existing pairs are never duplicated), so re-importing a
regenerated file is safe. Adapt STATUS_MAP and the job-object fields below to
whatever dashboard you import into.

Usage:
    python3 tools/careerpilot_export.py            # writes careerpilot-backup.json
    python3 tools/careerpilot_export.py out.json   # custom output path

Idempotent: output depends only on the tracker CSV (stable UUID5 ids from
company+role). To "reset", just delete the output file and re-run; to remove
rows from the tracker app itself, delete them in its UI (the import never deletes).
"""

import csv
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
TRACKER = REPO / "job_search_tracker.csv"
DEFAULT_OUT = REPO / "careerpilot-backup.json"

# Target app's status enum:
# "👀 New", "🎯 Target", "📨 Applied", "🤝 Interview",
# "❌ No Interview", "📉 No Offer", "🚫 Dismissed", "✅ Offer"
STATUS_MAP = {
    "preparing": "🎯 Target",
    "applied": "📨 Applied",
    "referral_pending": "📨 Applied",
    "interviewing": "🤝 Interview",
    "screening_call_done": "🤝 Interview",
    "awaiting_feedback": "🤝 Interview",
    "interview_only": "🤝 Interview",
    "rejected": "❌ No Interview",  # overridden to "📉 No Offer" if notes show an interview happened
    "no_response": "❌ No Interview",
    "withdrawn": "🚫 Dismissed",
    "offer_declined": "📉 No Offer",
    "hired": "✅ Offer",
}

NAMESPACE = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")  # uuid.NAMESPACE_DNS


def to_iso(date_str: str) -> str:
    date_str = (date_str or "").strip()
    for fmt in ("%Y-%m-%d", "%Y-%m"):
        try:
            return datetime.strptime(date_str, fmt).replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    return datetime.now(timezone.utc).isoformat()


def map_status(row: dict) -> str:
    status = (row.get("status") or "").strip().lower()
    mapped = STATUS_MAP.get(status, "👀 New")
    notes = (row.get("notes") or "").lower()
    if status == "rejected" and "interview" in notes:
        mapped = "📉 No Offer"
    return mapped


def main() -> int:
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    if not TRACKER.exists():
        print(f"error: {TRACKER} not found", file=sys.stderr)
        return 1

    jobs = []
    with open(TRACKER, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            company = (row.get("company") or "").strip()
            role = (row.get("role") or "").strip()
            if not company or not role:
                continue
            jobs.append(
                {
                    "id": str(uuid.uuid5(NAMESPACE, f"careerpilot:{company}__{role}".lower())),
                    "company": company,
                    "role": role,
                    "jd": "",
                    "url": "",
                    "report": "",
                    "score": None,
                    "verdict": "",
                    "structured_score": None,
                    "structured_breakdown": None,
                    "hard_no_violated": False,
                    "hard_no_reason": "",
                    "status": map_status(row),
                    "date": to_iso(row.get("date", "")),
                    "cvId": "",
                    "cvName": (row.get("cv_file") or "").strip(),
                    "notes": (row.get("notes") or "").strip(),
                }
            )

    out_path.write_text(json.dumps(jobs, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(jobs)} jobs -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
