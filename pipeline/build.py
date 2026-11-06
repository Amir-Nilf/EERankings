"""Builds data/ee.json and data/me.json from the downloaded papers.

Each author gets 1 / (number of authors) credit per paper and is counted at the school on
their most recent paper. "Faculty" means currently at a university and last or corresponding
author on at least PI_MIN papers in that discipline's venues.

Influence (used by the Advisor Index) is 1 + ln(1 + citations), split among the authors, as a
percentage of the venue's total for that year. The current year is compared against the
venue's median year so a few early papers can't get a huge share.

Venues marked "magazine" also publish columns, so their single-author items are skipped.
"""
import json
import math
from collections import defaultdict
from datetime import date
from pathlib import Path
from statistics import median

HERE = Path(__file__).parent
ROOT = HERE.parent
PI_MIN = 3

cfg = json.loads((HERE / "venues.json").read_text(encoding="utf-8"))
sources = json.loads((HERE / "cache" / "sources.json").read_text(encoding="utf-8"))
insts = json.loads((HERE / "cache" / "institutions.json").read_text(encoding="utf-8"))

# source id -> [(discipline, venue index within discipline)]
src_map = defaultdict(list)
magazine = set()
for disc, d in cfg.items():
    vi = 0
    for c in d["categories"]:
        for a in c["areas"]:
            for v in a["venues"]:
                if v["issn"] in sources:
                    src_map[sources[v["issn"]]["id"]].append((disc, vi))
                    if v.get("magazine"):
                        magazine.add(sources[v["issn"]]["id"])
                vi += 1

# Shown in the site footer
downloaded = date.fromtimestamp(max(f.stat().st_mtime for f in (HERE / "cache" / "works").glob("*.jsonl"))).isoformat()

names = {}
latest = {}                                   # author -> (year, {inst: n})
pubs = {d: defaultdict(lambda: defaultdict(lambda: [0, 0.0, 0.0])) for d in cfg}  # disc -> author -> (venue, year) -> [n, adj, influence]
venue_year = {d: defaultdict(float) for d in cfg}  # disc -> (venue, year) -> total paper value
senior = {d: defaultdict(int) for d in cfg}
years = set()

for f in sorted((HERE / "cache" / "works").glob("*.jsonl")):
    for line in f.open(encoding="utf-8"):
        w = json.loads(line)
        y, auths = w["y"], w["a"]
        targets = src_map.get(w["s"])
        if not targets or not auths or (w["s"] in magazine and len(auths) < 2):
            continue
        years.add(y)
        n = len(auths)
        value = 1 + math.log1p(w.get("c", 0))
        for disc, vi in targets:
            venue_year[disc][(vi, y)] += value
        for aid, name, pos, corr, inst in auths:
            if not aid:
                continue
            names[aid] = name
            if inst:
                ly = latest.get(aid)
                if ly is None or y > ly[0]:
                    latest[aid] = (y, {inst: 1})
                elif y == ly[0]:
                    ly[1][inst] = ly[1].get(inst, 0) + 1
            for disc, vi in targets:
                rec = pubs[disc][aid][(vi, y)]
                rec[0] += 1
                rec[1] += 1.0 / n
                rec[2] += value / n
                if pos == "l" or corr or n == 1:
                    senior[disc][aid] += 1

for disc, d in cfg.items():
    by_venue = defaultdict(list)
    for (vi, y), total in venue_year[disc].items():
        by_venue[vi].append(total)
    typical = {vi: median(totals) for vi, totals in by_venue.items()}
    inst_idx, inst_list, faculty = {}, [], []
    for aid, recs in pubs[disc].items():
        if senior[disc][aid] < PI_MIN or aid not in latest:
            continue
        inst = max(latest[aid][1].items(), key=lambda kv: kv[1])[0]
        iname, country, itype = insts.get(inst, [None, None, None])
        # Skip system-level records like "University of California System"
        if itype != "education" or not iname or iname.endswith(" System"):
            continue
        if inst not in inst_idx:
            inst_idx[inst] = len(inst_list)
            inst_list.append([iname, (country or "").lower(), inst])
        rows = [[vi, y, c, round(adj, 3), round(100 * inf / max(venue_year[disc][(vi, y)], typical[vi]), 4)]
                for (vi, y), (c, adj, inf) in sorted(recs.items())]
        faculty.append([names[aid], inst_idx[inst], aid, rows])
    areas = [{"code": c["code"], "name": c["name"],
              "areas": [{"code": a["code"], "name": a["name"],
                         "venues": [{"short": v["short"], "name": v["name"]} for v in a["venues"]]}
                        for a in c["areas"]]} for c in d["categories"]]
    out = {"title": d["title"], "generated": downloaded,
           "years": [min(years), max(years)], "pi_min": PI_MIN,
           "categories": areas, "insts": inst_list, "faculty": faculty}
    (ROOT / "data").mkdir(exist_ok=True)
    p = ROOT / "data" / f"{disc}.json"
    p.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"{disc}: {len(faculty)} faculty at {len(inst_list)} institutions -> {p} ({p.stat().st_size // 1024} KB)")
