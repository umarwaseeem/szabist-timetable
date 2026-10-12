# SZABIST classes today

A friendly, readable view of the SZABIST University Islamabad daily class
schedule. Pick your sections once, then see what is on now, what is next, and
where.

Unofficial. If the page and the [ZabDesk noticeboard](https://zabdesk.szabist-isb.edu.pk/ZabNoticeboard/StudentNoticeboard.aspx)
disagree, the noticeboard is right.

## Keeping the data current

A scheduled GitHub Action re-visits the noticeboard every morning, turns its
table into JSON, and commits whatever changed. The page itself only ever
reads that JSON, it never contacts the university site directly. See
[`.github/workflows/update-schedule.yml`](.github/workflows/update-schedule.yml)
for the schedule, and [`scripts/fetch-schedule.mjs`](scripts/fetch-schedule.mjs)
for the scraper.

## Quick start

```sh
npm run fetch   # collect today's schedule into data/
npm run dev     # serve on http://localhost:4173
npm test        # run the parser tests
```

Needs Node 20 or newer. No dependencies to install.

More detail, including the optional AI assistant, voice input, running on a
phone over a tunnel, and the JSON data shape, is in [`docs/USAGE.md`](docs/USAGE.md).
Design decisions are in [`docs/DESIGN.md`](docs/DESIGN.md).
