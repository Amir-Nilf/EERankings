"""Downloads the papers for every venue, newest year first.

Usage: python fetch.py [--refresh] [first_year] [last_year]

Finished years are skipped. --refresh downloads the two newest years again, since journals
keep adding to them. If a run stops early, run it again to pick up where it left off.

Cursor paging needs an API key, so this uses page= paging. That's capped at 10,000 results
per query, so each year's venues are split into batches under that limit.

Saved per paper: {"w": id, "y": year, "c": citations, "s": source_id,
                  "a": [[author_id, name, position, corresponding, inst_id], ...]}
"""
import json
import math
import sys
from datetime import date
from pathlib import Path

import oa

HERE = Path(__file__).parent
OUT = HERE / "cache" / "works"
OUT.mkdir(parents=True, exist_ok=True)
INST_FILE = HERE / "cache" / "institutions.json"
TYPES = "type:article|review|conference-paper"
PER_PAGE = 200
BATCH_MAX = 9800

args = [a for a in sys.argv[1:] if a != "--refresh"]
first = int(args[0]) if len(args) > 0 else 2020
last = int(args[1]) if len(args) > 1 else date.today().year

if "--refresh" in sys.argv:
    for year in (last, last - 1):
        (OUT / f"{year}.state").unlink(missing_ok=True)

sources = json.loads((HERE / "cache" / "sources.json").read_text(encoding="utf-8"))
all_ids = sorted({s["id"] for s in sources.values()})
insts = json.loads(INST_FILE.read_text(encoding="utf-8")) if INST_FILE.exists() else {}


def short(oid):
    return oid.rsplit("/", 1)[-1] if oid else None


def compact(w):
    src = short(((w.get("primary_location") or {}).get("source") or {}).get("id"))
    auths = []
    for a in w.get("authorships") or []:
        au = a.get("author") or {}
        inst = None
        for i in a.get("institutions") or []:
            iid = short(i.get("id"))
            if not iid:
                continue
            if iid not in insts:
                insts[iid] = [i.get("display_name"), i.get("country_code"), i.get("type")]
            if inst is None or (insts[inst][2] != "education" and i.get("type") == "education"):
                inst = iid
        auths.append([short(au.get("id")), au.get("display_name"),
                      (a.get("author_position") or "m")[0], 1 if a.get("is_corresponding") else 0, inst])
    return {"w": short(w["id"]), "y": w.get("publication_year"), "c": w.get("cited_by_count") or 0, "s": src, "a": auths}


def plan_batches(year):
    """Split the venues into batches of under BATCH_MAX papers for this year."""
    r = oa.get("works", {"filter": f"primary_location.source.id:{'|'.join(all_ids)},publication_year:{year},{TYPES}",
                         "group_by": "primary_location.source.id", "per-page": 200})
    counts = {short(g["key"]): g["count"] for g in r["group_by"]}
    batches, cur, n = [], [], 0
    for sid in sorted(counts, key=counts.get, reverse=True):
        if cur and n + counts[sid] > BATCH_MAX:
            batches.append({"ids": cur, "count": n, "page": 0})
            cur, n = [], 0
        cur.append(sid)
        n += counts[sid]
    if cur:
        batches.append({"ids": cur, "count": n, "page": 0})
    return batches


try:
    for year in range(last, first - 1, -1):
        state_f = OUT / f"{year}.state"
        data_f = OUT / f"{year}.jsonl"
        state = json.loads(state_f.read_text()) if state_f.exists() else None
        if state and state.get("done"):
            print(f"{year}: already done ({state['n']} works)")
            continue
        if not state:
            state = {"batches": plan_batches(year), "n": 0, "done": False}
            data_f.write_text("", encoding="utf-8")
        seen = {json.loads(l)["w"] for l in data_f.open(encoding="utf-8")} if state["n"] else set()
        print(f"{year}: {len(state['batches'])} batches, {sum(b['count'] for b in state['batches'])} works", flush=True)
        with data_f.open("a", encoding="utf-8") as fh:
            for b in state["batches"]:
                pages = math.ceil(b["count"] / PER_PAGE)
                while b["page"] < pages:
                    page = oa.get("works", {
                        "filter": f"primary_location.source.id:{'|'.join(b['ids'])},publication_year:{year},{TYPES}",
                        "select": "id,publication_year,cited_by_count,primary_location,authorships",
                        "sort": "publication_date:desc", "per-page": PER_PAGE, "page": b["page"] + 1})
                    for w in page["results"]:
                        rec = compact(w)
                        if rec["w"] not in seen:
                            seen.add(rec["w"])
                            fh.write(json.dumps(rec, separators=(",", ":")) + "\n")
                    fh.flush()
                    b["page"] += 1
                    state["n"] = len(seen)
                    state_f.write_text(json.dumps(state))
                    if oa.calls % 20 == 0:
                        INST_FILE.write_text(json.dumps(insts), encoding="utf-8")
                        print(f"  {year}: {state['n']} works", flush=True)
                    if not page["results"]:
                        break
        state["done"] = True
        state_f.write_text(json.dumps(state))
        INST_FILE.write_text(json.dumps(insts), encoding="utf-8")
        print(f"{year}: done, {state['n']} unique works", flush=True)
except oa.BudgetExhausted as e:
    print("Budget exhausted; rerun later (or set OPENALEX_API_KEY) to resume.\n", e)
finally:
    INST_FILE.write_text(json.dumps(insts), encoding="utf-8")
    print(f"calls this run: {oa.calls}")
