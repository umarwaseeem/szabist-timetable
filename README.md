# SZABIST classes today

A friendly, readable view of the SZABIST University Islamabad daily class schedule.
Pick your sections once, then see what is on now, what is next, and where.

The official board lives at
<https://zabdesk.szabist-isb.edu.pk/ZabNoticeboard/StudentNoticeboard.aspx>.
It shows one day at a time as a large table. This project collects that table
into JSON every morning and shows it in a page that works well on a phone.

## How it works

1. `scripts/fetch-schedule.mjs` downloads the noticeboard, parses the table and
   writes `data/days/<date>.json` plus `data/index.json`.
2. `scripts/fetch-programs.mjs` records the link to each program's full-semester
   PDF from <https://szabist-isb.edu.pk/timetable-all/> into `data/programs.json`.
3. The page in `index.html` is plain HTML, CSS and JavaScript with no build step.
   It reads the JSON files and renders everything in the browser.
4. Once on GitHub, `.github/workflows/update-schedule.yml` runs the fetch twice
   each morning (07:00 and 10:00 Pakistan time) and commits new data.
   `.github/workflows/deploy-pages.yml` publishes the site to GitHub Pages.

The noticeboard sends no CORS headers, so the browser cannot read it directly.
That is why a script collects the data first.

## Run it locally

Requires Node 20 or newer. There are no dependencies to install.

```sh
npm run fetch           # collect today's schedule into data/
npm run fetch:programs  # refresh the list of program PDFs
npm run dev             # serve on http://localhost:4173
npm test                # run the parser tests
```

Add `?now=HH:MM` to the URL to preview the page at a chosen time of day,
for example <http://localhost:4173/?now=12:15>.

## Data shape

Each `data/days/<date>.json` file looks like this:

```json
{
  "date": "2026-10-08",
  "weekday": "Thursday",
  "semester": "Fall 2026",
  "fetchedAt": "2026-10-08T02:00:00.000Z",
  "slots": [{ "id": "1", "label": "Slot 1", "range": { "start": 480, "end": 660 } }],
  "classes": [{
    "id": "1-bba-1-a-ba-1215-08-00-am-10-00-am",
    "sr": 1,
    "slot": "1",
    "department": "Management Sciences",
    "program": "BBA",
    "section": "BBA-1 A",
    "course": { "code": "BA 1215", "title": "Ideology and Constitution of Pakistan", "credits": null },
    "faculty": "Sadia Rasool",
    "room": "102",
    "online": false,
    "time": { "raw": "08:00 AM - 10:00 AM", "start": 480, "end": 600 },
    "campus": "H-8"
  }]
}
```

Times are minutes after midnight, Pakistan time.

## Not yet done

- Parsing the per-program semester PDFs. Each program uses a different layout
  and the text overlaps, so the page links to the PDFs instead.
- A weekly view. It becomes possible once a few days of data are collected.

This is an unofficial project. If the page and the noticeboard disagree,
the noticeboard is right.
