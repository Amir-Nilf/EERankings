"""Looks up each venue's OpenAlex ID from its ISSN and writes cache/sources.json."""
import json
import sys
from datetime import date
from pathlib import Path

import oa

HERE = Path(__file__).parent
FIRST_YEAR = int(sys.argv[1]) if len(sys.argv) > 1 else 2020
THIS_YEAR = date.today().year

cfg = json.loads((HERE / "venues.json").read_text(encoding="utf-8"))
venues = [v for d in cfg.values() for c in d["categories"] for a in c["areas"] for v in a["venues"]]
issns = sorted({v["issn"] for v in venues})

res = oa.get("sources", {"filter": "issn:" + "|".join(issns), "per-page": 200,
                         "select": "id,display_name,issn,issn_l,works_count,type"})
by_issn = {}
for s in res["results"]:
    for i in (s.get("issn") or []):
        by_issn.setdefault(i, []).append(s)

out = {}
for v in venues:
    cands = by_issn.get(v["issn"], [])
    if not cands:
        print(f"!! no source for {v['short']} ({v['issn']})")
        continue
    best = max(cands, key=lambda s: s["works_count"])
    out[v["issn"]] = {"id": best["id"].rsplit("/", 1)[-1], "display_name": best["display_name"]}

ids = [s["id"] for s in out.values()]
counts = oa.get("works", {
    "filter": f"primary_location.source.id:{'|'.join(ids)},publication_year:{FIRST_YEAR}-{THIS_YEAR},type:article|review|conference-paper",
    "group_by": "primary_location.source.id", "per-page": 200})
cnt = {g["key"].rsplit("/", 1)[-1]: g["count"] for g in counts["group_by"]}
total = 0
for v in venues:
    s = out.get(v["issn"])
    if not s:
        continue
    s["count"] = cnt.get(s["id"], 0)
    total += s["count"]
    print(f"{v['short']:12} {s['id']:12} {s['count']:7}  {s['display_name']}")
print(f"TOTAL works {FIRST_YEAR}-{THIS_YEAR}: {total}  (~{total // 200 + len(out)} list calls)")
(HERE / "cache" / "sources.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
