# EERankings / MERankings

Ranks electrical and mechanical engineering schools by what their faculty publish in each field's top journals and conferences. You can filter by area, venue, region and years, and open any school to see its faculty and a breakdown by area.

## Run it locally

```bash
python -m http.server 8765
```

Then open <http://localhost:8765>. The page loads its data with `fetch`, so opening `index.html` directly won't work.

Views are shareable through the URL: `#/<discipline>/<region>/<areas>[/<from>-<to>]`, for example `#/me/world/robotics,design/2022-2026`.

## Project layout

```
index.html, css/, js/    The website (no build step)
data/                    Generated rankings data the website loads
pipeline/venues.json     The areas and venues for each discipline
pipeline/resolve.py      Looks up each venue's OpenAlex ID
pipeline/fetch.py        Downloads the papers
pipeline/build.py        Turns the papers into data/ee.json and data/me.json
```

## How the score works

- A paper gives each of its authors a credit of 1 divided by the number of authors.
- An institution's total in an area is the sum of its faculty's credit there.
- The score is the geometric mean across the selected areas: `(Π (total_area + 1))^(1/N) − 1`.
- A person's papers all count toward their current institution.

**Who counts as faculty.** No hand-checked faculty list exists for these fields, so faculty are inferred. A person counts if their latest paper in these venues lists a university, and they were the last or corresponding author on at least 3 papers in that discipline's venues.

**Known limitations.**

- Credit goes to institutions, not departments, so aerospace or physics faculty who publish in these venues count too.
- OpenAlex sometimes splits one person into two profiles or merges two people.
- Some students and postdocs get through the faculty filter, and some faculty are missed.

## Advisor Index

The Advisor Index button switches to a second ranking built for choosing a graduate school:

1. **Influence:** a paper is worth `1 + ln(1 + citations)`, split equally among its authors, as a percentage of that venue's total for the year (`pipeline/build.py`).
2. **Recency:** influence is multiplied by `2^(−age/3)`, so it halves every 3 years.
3. **Advisor strength:** in each area, a person's influence is averaged over the selected venues and square-rooted. An institution's strength is the sum across its faculty.
4. **Score:** `((1/N) Σ √strength_area)²` across the selected areas, scaled so the top institution in view scores 100.

The weights are a judgment call, not an established standard.

## Updating the data

The site is a snapshot and doesn't update itself. To bring it up to date:

```bash
cd pipeline
python fetch.py --refresh
python build.py
```

`--refresh` downloads the current and previous year again, because journals keep adding papers to both. Then commit the changed `data/` files and push.

- **Cost:** a refresh takes about 250 OpenAlex queries. Without a key, OpenAlex allows about 1,000 a day. A free key from <https://openalex.org/settings/api> gives ten times that; set it as the `OPENALEX_API_KEY` environment variable and never commit it.
- **If it stops early:** run `python fetch.py` without `--refresh` to continue.
- **On a fresh clone:** `pipeline/cache/` isn't in the repository, so run `python resolve.py`, then `python fetch.py`, then `python build.py`. That full download takes about 850 queries.
- **Adding older years:** `python fetch.py 2016 2019`, then `python build.py`.
- **Changing venues:** edit `pipeline/venues.json`, then run `python resolve.py` and a full `python fetch.py`. Fetching only picks up a new venue for years it hasn't finished, so delete `pipeline/cache/works/` first.

## Credits

- **Created by:** Amir Nilforoushan ([GitHub](https://github.com/Amir-Nilf)).
- **Scoring method:** follows [CSRankings](https://csrankings.org) by Emery Berger, a ranking of computer science institutions. This is an independent project, isn't affiliated with or endorsed by CSRankings, and contains none of its code or data.
- **Publication data:** [OpenAlex](https://openalex.org), released under CC0. Priem, J., Piwowar, H., & Orr, R. (2022). OpenAlex: A fully-open index of scholarly works, authors, venues, institutions, and concepts. *ArXiv*. <https://arxiv.org/abs/2205.01833>
- **Flags:** [Flagpedia / flagcdn](https://flagpedia.net).
- **Font:** Hanken Grotesk, from Google Fonts under the SIL Open Font License.
