#!/usr/bin/env python3
"""Probe candidate company slugs against all six ATS vendors and report live boards.

Why this exists
---------------
`companies.json` only ever knew the companies someone added by hand, because no
ATS vendor exposes a "search every customer's board" endpoint. Growing it one
company at a time is slow and always lags. This script makes bulk growth cheap:
feed it candidate slugs, and it tells you which vendor (if any) actually hosts
each one's board, verified by a live request.

It is deliberately *additive and idempotent*: it never removes or rewrites an
existing entry, and re-running it with the same input is a no-op. Slugs already
in the registry are skipped without a request.

Usage
-----
    # dry run - print what would be added
    python3 probe_slugs.py --slugs acme,globex

    # read candidates from a file (one slug per line, blank/# lines ignored)
    python3 probe_slugs.py --file candidates.txt

    # actually write them into companies.json
    python3 probe_slugs.py --file candidates.txt --write

    # re-verify every slug already in the registry and report dead boards
    python3 probe_slugs.py --audit

Notes
-----
- A "live board" means the vendor's public API answered with a job list. An
  empty board still counts as live (the company simply has nothing open) EXCEPT
  under --audit, which reports empties separately so a dead slug can be spotted.
- Vendor probe reliability differs, and it matters:
    greenhouse / lever / ashby  - proper 404 on unknown slugs. Reliable.
    recruitee                   - proper 404 (`{"error":"Not Found"}`) on unknown
                                  slugs, verified 2026-09-22 against two nonsense
                                  slugs. Reliable, and unlike smartrecruiters an
                                  EMPTY board still counts as a hit.
    workable                    - serves HTML on unknown slugs, so JSON parsing
                                  fails and it reads as a miss. Reliable.
    smartrecruiters             - answers 200 with an empty list for ANY string.
                                  Only a NON-EMPTY board counts as proof, so a
                                  real customer with nothing open reads as a
                                  miss. See probe_smartrecruiters.
  Always sanity-check a newly added vendor with a nonsense slug before trusting
  its hits: a vendor that answers 200 for anything turns every miss into a
  bogus registry entry that then wastes a poll on every daily sweep.
- Tags are a guess and are meant to be corrected by hand; the registry is a
  cache, not a source of truth about what a company does.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REGISTRY = Path(__file__).with_name("companies.json")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
TIMEOUT = 15


def fetch(url: str) -> object | None:
    """GET + parse JSON. None on any failure — a probe miss is not an error."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            if r.status != 200:
                return None
            # Some boards emit raw control characters inside description strings.
            return json.loads(r.read().decode("utf-8", "replace"), strict=False)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, OSError):
        return None


def probe_greenhouse(slug: str) -> int | None:
    d = fetch(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs")
    if isinstance(d, dict) and isinstance(d.get("jobs"), list):
        return len(d["jobs"])
    return None


def probe_lever(slug: str) -> int | None:
    d = fetch(f"https://api.lever.co/v0/postings/{slug}?mode=json")
    return len(d) if isinstance(d, list) else None


def probe_ashby(slug: str) -> int | None:
    d = fetch(f"https://api.ashbyhq.com/posting-api/job-board/{slug}")
    if isinstance(d, dict) and isinstance(d.get("jobs"), list):
        return len(d["jobs"])
    return None


def probe_workable(slug: str) -> int | None:
    d = fetch(f"https://apply.workable.com/api/v1/widget/accounts/{slug}?details=true")
    if isinstance(d, dict) and isinstance(d.get("jobs"), list):
        return len(d["jobs"])
    return None


def probe_recruitee(slug: str) -> int | None:
    """Recruitee IS a reliable existence probe, including for an empty board.

    Verified 2026-09-22: `https://<slug>.recruitee.com/api/offers/` answers HTTP
    404 with `{"error":"Not Found"}` for an unknown slug (checked against
    "definitely-not-a-real-company-xyz123" and "zzz-nonsense-slug-9876"), and
    200 with `{"offers":[...]}` for a real one ("pvcase" 11, "channable" 15).
    The empty case was checked directly too: "rockstart" is a real board that
    answers 200 with `{"offers":[]}`. So, unlike smartrecruiters, a live-but-
    empty board can safely be treated as a hit — `offers` being a list is the
    proof, not its length.

    Some boards 302 to a vanity careers domain ("tonyschocolonely"); urllib
    follows that and still lands on the JSON, so those read as hits.

    Added because the daily sweep once missed a strong-fit role at a company
    that hosts its board on a vanity careers domain backed by Recruitee; this
    script reported 0 live boards for the slug simply because no probe here
    covered the vendor. A company's own
    careers domain says nothing about its ATS — always probe.
    """
    d = fetch(f"https://{slug}.recruitee.com/api/offers/")
    if isinstance(d, dict) and isinstance(d.get("offers"), list):
        return len(d["offers"])
    return None


def probe_smartrecruiters(slug: str) -> int | None:
    """SmartRecruiters is NOT a reliable existence probe when the board is empty.

    Verified 2026-09-08: the endpoint answers HTTP 200 with
    `{"totalFound":0,"content":[]}` for *any* string, including
    "definitely-not-a-real-company-xyz123". An empty response therefore proves
    nothing, and treating it as a hit marks every miss as a live board — on the
    first run of this script that turned 188 unmatched candidates into 188
    bogus "hits". Only a non-empty posting list is evidence the company exists.

    The cost of this is real but acceptable: a genuine SmartRecruiters customer
    with nothing currently open is reported as a miss. That is the safe
    direction to fail — a missing company gets rediscovered by the next
    discovery pass, whereas a bogus entry silently wastes a poll every day.
    """
    d = fetch(f"https://api.smartrecruiters.com/v1/companies/{slug}/postings")
    if isinstance(d, dict) and isinstance(d.get("content"), list) and d["content"]:
        return len(d["content"])
    return None


PROBES = {
    "greenhouse": probe_greenhouse,
    "lever": probe_lever,
    "ashby": probe_ashby,
    "workable": probe_workable,
    "recruitee": probe_recruitee,
    "smartrecruiters": probe_smartrecruiters,
}


def probe_one(slug: str) -> tuple[str, str | None, int]:
    """Return (slug, ats_or_None, job_count). First vendor that answers wins."""
    for ats, fn in PROBES.items():
        n = fn(slug)
        if n is not None:
            return slug, ats, n
    return slug, None, 0


def load_registry() -> dict:
    return json.loads(REGISTRY.read_text(encoding="utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--slugs", help="comma-separated candidate slugs")
    ap.add_argument("--file", help="file with one candidate slug per line")
    ap.add_argument("--write", action="store_true", help="write hits into companies.json")
    ap.add_argument("--audit", action="store_true", help="re-verify slugs already in the registry")
    ap.add_argument("--tag", default="discovered", help="tag applied to newly added entries")
    ap.add_argument("--workers", type=int, default=8, help="parallel probes (keep modest)")
    args = ap.parse_args()

    reg = load_registry()
    existing = {(c["ats"], c["slug"]) for c in reg["companies"]}
    existing_slugs = {c["slug"] for c in reg["companies"]}

    if args.audit:
        print(f"Auditing {len(reg['companies'])} registered boards…\n")
        dead, empty = [], []
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            results = ex.map(
                lambda c: (c, PROBES[c["ats"]](c["slug"]) if c["ats"] in PROBES else None),
                reg["companies"],
            )
            for c, n in results:
                if n is None:
                    dead.append(c)
                    print(f"  DEAD   {c['name']:<34} {c['ats']}/{c['slug']}")
                elif n == 0:
                    empty.append(c)
        print(f"\n{len(dead)} dead, {len(empty)} live-but-empty, "
              f"{len(reg['companies']) - len(dead) - len(empty)} live with openings.")
        if dead:
            print("\nDead boards are NOT removed automatically — a vendor migration looks "
                  "identical to a shutdown. Re-check by hand before deleting.")
        return 0

    candidates: list[str] = []
    if args.slugs:
        candidates += [s.strip() for s in args.slugs.split(",") if s.strip()]
    if args.file:
        for line in Path(args.file).read_text(encoding="utf-8").splitlines():
            line = line.split("#", 1)[0].strip()
            if line:
                candidates.append(line)
    if not candidates:
        ap.error("give --slugs, --file, or --audit")

    # Idempotent: never re-probe something already registered.
    todo = [s for s in dict.fromkeys(candidates) if s not in existing_slugs]
    skipped = len(dict.fromkeys(candidates)) - len(todo)
    print(f"{len(todo)} to probe ({skipped} already in registry)\n")

    hits: list[dict] = []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for slug, ats, n in ex.map(probe_one, todo):
            if ats and (ats, slug) not in existing:
                hits.append({"ats": ats, "slug": slug, "name": slug, "tags": [args.tag]})
                print(f"  HIT   {slug:<28} {ats:<16} {n} open")

    print(f"\n{len(hits)} live board(s) found out of {len(todo)} probed.")
    if not hits:
        return 0

    if not args.write:
        print("\nDry run — re-run with --write to add these. Fix the `name` and `tags` "
              "fields afterwards; both are guesses.")
        return 0

    reg["companies"].extend(hits)
    REGISTRY.write_text(json.dumps(reg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(hits)} entries. Registry now {len(reg['companies'])} companies.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
