# EERankings

**Live site: https://amir-nilf.github.io/EERankings/**

Ranks electrical and mechanical engineering schools by what their faculty publish in each field's top journals and conferences. You can filter by area, venue, region and years, and open any school to see its faculty and a breakdown by area.

<img width="1315" height="851" alt="Screenshot 2026-11-05 204030" src="https://github.com/user-attachments/assets/7c12c39f-cdb3-421f-bc42-f44ce85ef703" />

## Using the site

- Electrical / Mechanical: switches between the two disciplines.
- Region and years: limit the ranking to a part of the world or a range of publication years.
- Areas: turn areas on or off. Click an area's name to choose individual venues.
- Schools: click a school to see its papers by area. Click the person icon to see its faculty.
- Advisor Index: switches to a second ranking meant for choosing a grad school.

Any view can be shared by copying the URL, for example [mechanical, worldwide, robotics and design, 2022-2026](https://amir-nilf.github.io/EERankings/#/me/world/robotics,design/2022-2026).

## How the ranking works

- Each author on a paper gets 1 / (number of authors) credit.
- A school's total in an area is the sum of its faculty's credit there.
- The count is the geometric mean across the selected areas: `(Π (total_area + 1))^(1/N) − 1`.
- All of a person's papers count toward their current school.

**Who counts as faculty.** There's no hand-checked faculty list for these fields, so faculty are inferred. Someone counts if their latest paper in these venues lists a university and they were last or corresponding author on at least 3 papers in that discipline's venues.

**Known limitations.**

- Credit goes to schools, not departments, so aerospace or physics faculty who publish in these venues count too.
- OpenAlex sometimes splits one person into two profiles or merges two people.
- Some students and postdocs get through the faculty filter, and some faculty get missed.


## Updating the rankings

The site is a snapshot and doesn't update itself. To bring it up to date:

```bash
cd pipeline
python fetch.py --refresh
python build.py
```

Then commit the changed `data/` files and push. GitHub Pages republishes the site automatically.

- `--refresh` downloads the current and previous year again, since journals keep adding papers to both.
- **API limits:** a refresh takes about 250 OpenAlex queries, and OpenAlex allows about 1,000 a day without a key. A free key from <https://openalex.org/settings/api> gives ten times that. Set it as the `OPENALEX_API_KEY` environment variable and never commit it.
- **If it stops early:** run `python fetch.py` again to continue.
- **On a fresh clone:** `pipeline/cache/` isn't in the repo, so run `python resolve.py`, `python fetch.py` and `python build.py`. The full download takes about 850 queries.
- **Older years:** `python fetch.py 2016 2019`, then `python build.py`.
- **Changing venues:** edit `pipeline/venues.json`, delete `pipeline/cache/works/`, then run all three scripts.

## Credits

Created by Amir Nilforoushan.
- Scoring method: follows [CSRankings](https://csrankings.org) by Emery Berger, a ranking of computer science institutions. This is an independent project, isn't affiliated with or endorsed by CSRankings, and contains none of its code or data.
- Publication data: [OpenAlex](https://openalex.org), released under CC0. Priem, J., Piwowar, H., & Orr, R. (2022). OpenAlex: A fully-open index of scholarly works, authors, venues, institutions, and concepts. *ArXiv*. <https://arxiv.org/abs/2205.01833>
- Flags: [Flagpedia / flagcdn](https://flagpedia.net).
- Font: Hanken Grotesk, from Google Fonts under the SIL Open Font License.
